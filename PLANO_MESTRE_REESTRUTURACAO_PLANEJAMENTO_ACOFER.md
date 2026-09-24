# PLANO MESTRE DE REESTRUTURAÇÃO — PLANEJAMENTO AÇO-FER V1

**Fonte funcional superior:** `docs/refactor/PLANNING_SIMULATION_CANONICAL_SPEC.md`.
Em caso de conflito funcional entre este plano historico de reestruturacao e o spec canonico, o spec prevalece.

**Projeto:** Planejamento Aço-Fer  
**Responsável funcional:** Gustavo (“Gu”) — PCP Aço-Fer  
**Empresas:** Catrion + Aço-Fer  
**Documento operacional para:** Gu, ChatGPT coordenador e Codex  
**Data-base da auditoria:** 06/08/2026  
**Status geral:** `[ ] NÃO INICIADO`  
**Versão do documento:** 1.0

---

## 1. Finalidade deste documento

Este arquivo é a fonte de coordenação da reestruturação da versão 1 do Planejamento Aço-Fer.

Ele deve ser lido pelo Codex **antes de qualquer alteração relacionada à reestruturação**, junto com `AGENTS.md` e com as skills do domínio envolvido. O objetivo é permitir que o projeto seja reorganizado com rastreabilidade, preservando o comportamento produtivo existente e evitando alterações amplas, silenciosas ou impossíveis de auditar.

A reestruturação escolhida é a **Opção 2**:

1. manter, nesta versão, a stack atual em JavaScript ESM, Node.js e Express;
2. não migrar agora para TypeScript, React, Vite ou Tailwind;
3. dividir `pages/PlanningPage.js` em módulos menores e com responsabilidades claras;
4. auditar outros arquivos grandes, mas só dividi-los quando houver justificativa arquitetural e escopo aprovado;
5. consolidar o **Gantt APS como a única interface de calendário/planejamento**;
6. remover o Calendário V2 do código ativo depois de extrair tudo que ainda for reutilizado pelo Gantt ou pela regra de negócio;
7. preservar banco, APIs, planejamentos salvos, drafts manuais, regras de estoque, precedências, capacidade, reotimização e auditoria;
8. preparar a arquitetura para uma futura versão 2/Line, quando a migração de stack será feita em um projeto duplicado e controlado.

Este documento não deve ser tratado como uma lista informal. Ele é um **checklist de execução com gates**, evidências e critérios de aceite.

---

## 2. Decisão arquitetural aprovada

### 2.1 O que será feito agora

- [ ] Estabilizar e registrar o estado atual do projeto.
- [ ] Corrigir ou reclassificar a suíte de testes atual antes da refatoração ampla.
- [ ] Auditar responsabilidades e dependências da `PlanningPage.js`.
- [ ] Extrair funções puras, adapters, controladores e módulos de UI sem alterar comportamento.
- [ ] Remover a dependência arquitetural do Gantt em relação ao pacote visual do Calendário V2.
- [ ] Garantir paridade operacional suficiente no Gantt APS.
- [ ] Tornar o Gantt APS o único renderer ativo.
- [ ] Remover fallback, flags, renderer, componentes, CSS e testes exclusivos do Calendário V2.
- [ ] Reduzir a `PlanningPage.js` a uma página orquestradora.
- [ ] Auditar os demais arquivos grandes e produzir recomendação objetiva.
- [ ] Homologar o fluxo completo como usuário de PCP.

### 2.2 O que não será feito nesta versão

- ⛔ Converter o frontend para React.
- ⛔ Converter o projeto para TypeScript.
- ⛔ Introduzir Vite.
- ⛔ Migrar o CSS geral para Tailwind.
- ⛔ Migrar o backend para outra stack.
- ⛔ Implementar Electron.
- ⛔ Introduzir funcionalidades do Line, laboratório ou rastreabilidade.
- ⛔ Redesenhar toda a interface.
- ⛔ Alterar banco ou migrations sem necessidade comprovada e aprovação específica.
- ⛔ Reescrever o motor APS.
- ⛔ Aproveitar a refatoração para “melhorar” regras produtivas não solicitadas.

### 2.3 Direção futura

Quando a versão 1 estiver estável e operacional, o projeto poderá ser duplicado para iniciar a versão 2/Line. Nessa fase futura serão reavaliados:

- TypeScript;
- React;
- Vite;
- Tailwind CSS;
- Node.js/Express tipado;
- PostgreSQL/Neon;
- Clerk;
- Cloudflare R2;
- laboratório;
- rastreabilidade de materiais e lotes;
- anexos, imagens, certificados e laudos;
- novos módulos industriais.

A reestruturação atual deve facilitar essa migração futura, mas **não pode depender dela**.

---

## 3. Estado técnico encontrado em 06/08/2026

### 3.1 Stack atual identificada

- Frontend JavaScript ESM sem build.
- HTML e CSS servidos diretamente.
- Node.js + Express.
- PostgreSQL/Neon.
- Autenticação e autorização existentes no projeto atual.
- Services de domínio em `services/`.
- Rotas em `server/routes/`.
- Banco e migrations em `database/`.
- Gantt APS em `shared/planning-schedule-view/gantt-aps/`.
- Calendário V2 em `shared/production-calendar/`.

### 3.2 Arquivos grandes relevantes

Tamanho não é, sozinho, justificativa para refatorar. A lista abaixo define apenas pontos de auditoria.

| Arquivo | Linhas aproximadas | Observação inicial |
|---|---:|---|
| `style.css` | 8.108 | Muito grande, porém predominantemente visual; não é prioridade de domínio. |
| `pages/PlanningPage.js` | 7.097 | Principal alvo; mistura estado, API, UI, simulação, estoque, fluxo, Gantt, edição, persistência e histórico. |
| `services/planning.service.js` | 2.656 | Motor automático; alto risco. Não dividir sem auditoria específica e testes fortes. |
| `pages/AnalysisPage.js` | 2.340 | Auditar depois da PlanningPage. |
| `pages/ImportHistoryPage.js` | 1.781 | Auditar depois da PlanningPage. |
| `server/routes/planning.routes.js` | 1.628 | Orquestra API/persistência; alto risco. |
| `services/planningReoptimization.service.js` | 1.548 | Domínio de reotimização; alto risco. |
| `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js` | 1.168 | Renderer visual relevante; auditar responsabilidades e lifecycle. |
| `shared/CalendarTimeline.js` | 2.594 | Renderer/timeline legado adicional; verificar uso real e destino. |

### 3.3 Situação do Git no ZIP analisado

O pacote analisado contém uma árvore de trabalho com muitas alterações modificadas e arquivos novos ainda não registrados em commit. Isso inclui serviços, testes, documentação e evolução do Gantt.

**Consequência obrigatória:** nenhuma refatoração deve começar antes de criar uma fotografia segura do estado atual. O Codex não pode assumir que `HEAD` representa o sistema atual.

### 3.4 Situação atual do Gantt e do Calendário V2

No baseline historico de 06/08/2026, foram identificados:

- `USE_PRODUCTION_CALENDAR_V2 = true` em `pages/PlanningPage.js`;
- renderer host com opções `production-calendar-v2`, `gantt-aps` e `auto`;
- fallback padrão para `production-calendar-v2`;
- `createProductionCalendarV2Renderer` ainda registrado;
- mensagem de rollback explícita para o Calendário V2;
- `PlanningPage.js` importando diretamente componentes e utilitários de `shared/production-calendar/`;
- Gantt importando função de cor de `ProductionCalendarCard.js`;
- funções e variáveis com prefixo `productionCalendar` que hoje já atendem também ao Gantt;
- testes e documentação ainda acoplados à nomenclatura V2.

Portanto, “apagar a pasta do V2” agora quebraria funcionalidades e testes. Primeiro é necessário separar:

1. visual exclusivo do V2;
2. lógica neutra de apresentação reutilizável;
3. adapters de calendário que são, na verdade, adapters do planejamento;
4. UI operacional ainda usada pelo Gantt;
5. contratos produtivos que nunca deveriam estar dentro do pacote visual.

### 3.5 Baseline da suíte de testes

Comando executado na auditoria:

```bash
node --test tests/*.js
```

Resultado em 06/08/2026:

```text
51 testes
45 aprovados
6 falharam
```

Falhas observadas:

1. `tests/manualScheduleAllocationSplit.service.test.js`
   - cenário: edição localizada de uma parte dividida;
   - indício: ordem/posição da parte editada pode ter mudado;
   - classificação atual: **possível defeito funcional ou contrato de ordem não formalizado**;
   - deve ser investigado antes da refatoração.

2. `tests/planningConstraintRecalculation.service.test.js`
   - usa datas que já ficaram no passado em relação a 06/08/2026;
   - classificação atual: **teste dependente do relógio/data atual**;
   - deve usar datas relativas controladas ou relógio injetável.

3. `tests/planningManualScheduleIntegration.test.js`
   - procura estrutura/harness antigo por inspeção de código;
   - classificação atual: **teste estático provavelmente desatualizado**.

4. `tests/planningManualStockPartialModal.test.js`
   - inspeção textual captura referências fora do fluxo que pretendia analisar;
   - classificação atual: **teste estático frágil/falso positivo provável**.

5. `tests/planningScheduleRenderer.test.js`
   - espera uma ligação de foco que não foi encontrada no trecho extraído;
   - classificação atual: **pode representar regressão real de foco Fluxo → Gantt ou teste desatualizado**;
   - requer investigação funcional.

6. `tests/productionCalendarDayHeader.test.js`
   - harness DOM não possui `querySelector` usado pelo componente atual;
   - classificação atual: **simulador DOM incompleto ou teste acoplado ao V2**.

Nenhuma dessas falhas pode ser simplesmente “ajustada para verde”. Cada uma precisa ter causa, decisão e evidência.

---

## 4. Definições obrigatórias

### 4.1 O que significa “não quebrar o sistema”

A refatoração será considerada segura quando preservar, para as mesmas entradas:

- produções e quantidades;
- árvore produtiva;
- componentes e consumos;
- máquinas e pessoas;
- produtividade e duração;
- datas e horários calculados;
- dependências e precedências;
- estoque inicial, consumo e produção disponível;
- divisões e resíduos;
- `allocationId` e linhagens;
- draft manual;
- undo/redo;
- reotimização e passado congelado;
- save, refresh e reopen;
- revisão otimista;
- auditoria;
- permissões;
- planejamentos legados;
- comportamento do Gantt aprovado pelo Gu.

Uma mudança apenas de arquivo, nome interno ou organização não pode alterar esses resultados.

### 4.2 O que significa “remover o Calendário V2”

Ao final, deve haver:

- nenhum renderer V2 ativo;
- nenhum fallback silencioso para V2;
- nenhuma flag de seleção do V2;
- nenhum import do pacote visual V2 pela página de planejamento;
- nenhum import do pacote visual V2 pelo Gantt;
- nenhum componente de grid/card/toolbar/details/drag exclusivo do V2 no código ativo;
- nenhum CSS exclusivo do V2 carregado;
- nenhum teste que valide o V2 como produto ativo;
- nenhuma documentação normativa dizendo que o V2 é fallback ou fonte oficial;
- nenhuma regra de negócio dependente de classes ou estrutura DOM do V2.

**Exceção de rastreabilidade:** referências em um histórico técnico arquivado podem permanecer para registrar a evolução, desde que estejam explicitamente marcadas como históricas, não sejam importadas e não participem do runtime.

### 4.3 O que significa “dividir a PlanningPage”

Não basta recortar o arquivo em vários arquivos que continuam acoplados por variáveis globais.

A divisão correta deve:

- separar responsabilidades por domínio/feature;
- mover primeiro funções puras;
- usar dependências explícitas;
- evitar circularidade;
- impedir que UI vire fonte de regra produtiva;
- manter a página como orquestradora;
- preservar um fluxo claro de estado e eventos;
- permitir testes focados sem montar a página inteira;
- evitar “arquivo utilitário genérico” que vire outro monólito;
- evitar passar objetos gigantes sem contrato apenas para esconder o acoplamento.

### 4.4 O que significa “paridade do Gantt”

O Gantt não precisa copiar visualmente o V2. Ele precisa suportar o fluxo operacional aprovado para o PCP.

A paridade deve ser avaliada por capacidades:

- visualizar máquinas e alocações;
- identificar produções separadas;
- inspecionar detalhes;
- foco por `allocationId`;
- zoom e horizonte;
- fullscreen;
- movimentar alocação permitida;
- rejeitar movimento inválido;
- editar configuração quando aplicável;
- dividir alocação;
- transporte;
- capacidade e pessoas;
- dias extraordinários;
- undo/redo;
- descarte de alterações;
- salvar e reabrir;
- diagnósticos;
- projeção de estoque por data;
- preservação de viewport e seleção quando aplicável.

Cada capacidade deve ser marcada como:

- `DISPONÍVEL NO GANTT`;
- `DISPONÍVEL FORA DO GANTT, MAS ACESSÍVEL NO FLUXO`;
- `AINDA DEPENDENTE DO V2`;
- `NÃO NECESSÁRIA`;
- `BLOQUEADA`.

---

## 5. Regras invioláveis de execução

### 5.1 Regras de segurança

- [ ] Codex deve ler `AGENTS.md` e este arquivo antes de editar.
- [ ] Codex deve carregar apenas as skills necessárias ao domínio da missão.
- [ ] Nenhuma missão pode alterar mais de um objetivo arquitetural principal.
- [ ] Nenhuma missão pode misturar refatoração com nova funcionalidade produtiva.
- [ ] Nenhuma missão pode alterar banco/migration sem aprovação explícita.
- [ ] Nenhuma missão pode fazer commit ou push sem ordem do Gu.
- [ ] Alterações existentes do usuário devem ser preservadas.
- [ ] Não usar `git reset --hard`, `git clean -fd`, checkout destrutivo ou comando equivalente.
- [ ] Não remover arquivos do V2 antes do gate de Gantt exclusivo.
- [ ] Não alterar nomes persistidos ou payloads sem camada de compatibilidade.
- [ ] Não alterar `allocationId` ou derivar identidade persistente de data, máquina ou texto visual.
- [ ] Não chamar scheduler automático em movimento manual.
- [ ] Não recalcular plano salvo silenciosamente ao abrir.
- [ ] Não mascarar erro de domínio com fallback visual.
- [ ] Não criar regra de estoque, precedência, produtividade ou capacidade dentro do Gantt.
- [ ] Não considerar teste verde como homologação operacional.

### 5.2 Regra de compatibilidade durante movimentação de arquivos

Ao mover um módulo utilizado por muitos consumidores:

1. criar o novo módulo neutro;
2. mover/copiar a implementação preservando o contrato;
3. manter temporariamente um re-export compatível no caminho antigo quando necessário;
4. migrar consumidores em missões pequenas;
5. executar testes focados;
6. remover o re-export apenas quando não houver consumidores;
7. confirmar com `rg` que o caminho antigo não é mais usado.

### 5.3 Regra de check no documento

O Codex só pode marcar `[x]` quando:

- o escopo daquela caixa foi concluído;
- os critérios de aceite foram atendidos;
- os testes definidos foram executados;
- o resultado foi registrado no log deste documento;
- não há falha bloqueante aberta;
- mudanças visíveis foram homologadas pelo Gu ou marcadas como aguardando homologação.

Se houver implementação parcial, manter `[ ]` e escrever `STATUS: PARCIAL` no registro da missão.

### 5.4 Regra de interrupção

O Codex deve parar e não ampliar escopo quando encontrar:

- divergência de regra produtiva;
- necessidade de migration;
- alteração de contrato persistido;
- risco de perda de draft;
- mudança de IDs;
- comportamento legado sem decisão;
- regressão não relacionada à missão;
- conflito com alterações existentes;
- falha de teste que não possa ser explicada.

Nesses casos, deve registrar o bloqueio e devolver evidências.

### 5.5 Regra de contagem física da `PlanningPage.js`

Para registrar contagem física de linhas da `PlanningPage.js`, usar somente:

```text
node -e "const fs=require('fs'); const s=fs.readFileSync('pages/PlanningPage.js','utf8'); console.log(s.split(/\r?\n/).length)"
```

Para conferir versões em commits, usar somente:

```text
node -e "const {execFileSync}=require('child_process'); const s=execFileSync('git',['show','<COMMIT>:pages/PlanningPage.js'],{encoding:'utf8'}); console.log(s.split(/\r?\n/).length)"
```

Não usar `Measure-Object -Line` para registrar essa métrica.

---

## 6. Fluxo obrigatório de cada missão

Cada missão seguirá esta sequência:

```text
Ler AGENTS.md + este plano
→ identificar a missão e o domínio
→ carregar skill(s) correta(s)
→ confirmar estado do Git
→ ler fontes canônicas
→ localizar testes existentes
→ apresentar preflight curto
→ alterar somente o escopo
→ executar validação focada
→ executar regressão necessária
→ registrar diff e evidências
→ atualizar checkboxes e log
→ entregar para revisão técnica
→ homologar quando houver impacto operacional
```

### 6.1 Preflight obrigatório do Codex

Antes de editar, o Codex deve declarar:

- missão executada;
- objetivo único;
- arquivos que pretende ler;
- arquivos que pretende alterar;
- invariantes que serão protegidas;
- testes previstos;
- itens fora do escopo.

### 6.2 Entrega obrigatória do Codex

Toda resposta de missão deve conter:

1. `Status da missão`;
2. `Skills usadas`;
3. `Fontes canônicas consultadas`;
4. `Arquivos analisados`;
5. `Arquivos alterados`;
6. `Resumo da mudança`;
7. `Diff resumido`;
8. `Testes/comandos executados`;
9. `Resultados`;
10. `Riscos e limitações`;
11. `Checkboxes atualizados`;
12. `Próxima missão recomendada`.

### 6.3 Regra de coordenação entre Gu, ChatGPT e Codex

A cada ciclo de trabalho:

1. o Gu envia ao ChatGPT a versão mais recente deste plano, ou confirma que o arquivo no projeto foi atualizado pelo Codex;
2. o Gu envia a resposta do Codex, o diff ou os arquivos alterados relevantes;
3. o ChatGPT relê o plano, especialmente o quadro de status e o registro de execução;
4. o ChatGPT confere se a missão anterior atingiu o gate e se existe bloqueio;
5. o ChatGPT prepara **um prompt para a próxima missão**, sem pular etapas nem agrupar alterações incompatíveis;
6. o Codex lê novamente `AGENTS.md`, este plano e as skills indicadas;
7. o Codex executa, testa, atualiza checkboxes e registra a execução;
8. mudanças visíveis ou operacionais retornam ao Gu para homologação.

O ChatGPT não deve assumir que uma caixa foi concluída apenas porque o Codex disse “feito”. É necessário conferir evidências, testes e, quando aplicável, o comportamento operacional.

Quando o plano atualizado não estiver disponível, o prompt seguinte deve ser baseado no último estado comprovado e declarar essa limitação.

---

# 7. FASES E MISSÕES

---

## FASE 0 — Preservação, fotografia e governança

**Objetivo:** garantir que o estado atual possa ser recuperado e comparado.

### Missão REF-000 — Criar baseline seguro

**Status:** `[x] CONCLUÍDA`

#### Tarefas

- [x] Ler `AGENTS.md`, este plano e documentos APS existentes.
- [x] Executar `git status --short`.
- [x] Executar `git diff --stat`.
- [x] Listar arquivos não rastreados relevantes.
- [x] Registrar branch e commit atual.
- [x] Confirmar que o estado atual contém mudanças ainda não commitadas.
- [x] Criar instruções para backup/checkpoint sem apagar alterações.
- [x] Confirmar que `.env` não será incluído em novo pacote ou commit.
- [x] Confirmar que não haverá commit/push automático.
- [x] Registrar versão do Node utilizada.
- [x] Registrar baseline da suíte completa.
- [x] Registrar comandos mínimos de inicialização do servidor.

#### Gate

- Existe uma fotografia recuperável do projeto atual.
- O Gu sabe onde está o backup/checkpoint.
- Nenhuma linha funcional foi alterada.

#### Evidências esperadas

- saída resumida de Git;
- baseline de testes;
- lista de arquivos sensíveis;
- registro no log.

---

## FASE 1 — Auditoria arquitetural antes da edição

**Objetivo:** entender o acoplamento real e produzir mapa de separação.

### Missão REF-001 — Mapear responsabilidades da `PlanningPage.js`

**Status:** `[x] CONCLUÍDA`

#### Responsabilidades já observadas e que devem ser confirmadas

- [x] formatação, datas e números;
- [x] draft local e autosave;
- [x] carregamento de lookups;
- [x] formulário de produções e turnos;
- [x] decisões de falta de estoque;
- [x] fluxo produtivo e conectores;
- [x] adaptação de operações para calendário;
- [x] snapshot aceito do calendário;
- [x] validação manual;
- [x] movimentação de alocações;
- [x] reotimização incremental;
- [x] transporte;
- [x] edição de máquina/pessoas/capacidade;
- [x] divisão;
- [x] otimização de utilização;
- [x] projeção de estoque;
- [x] simulação;
- [x] lançamento do planejamento;
- [x] detalhes e modais;
- [x] histórico, cancelamento, abertura e PDF;
- [x] Gantt/renderer host;
- [x] legado V2;
- [x] estado de viewport e fullscreen;
- [x] eventos DOM.

#### Saídas obrigatórias

- [x] mapa por faixas de linha e funções;
- [x] mapa de estado mutável da página;
- [x] grafo de dependências entre grupos de funções;
- [x] lista de funções puras extraíveis imediatamente;
- [x] lista de funções que dependem de closure;
- [x] lista de regras de domínio indevidamente próximas da UI;
- [x] lista de callbacks do Gantt e do V2;
- [x] proposta de módulos-alvo;
- [x] riscos de circularidade;
- [x] ordem de extração recomendada.

#### Proibição

- Não editar código produtivo nesta missão.

---

### Missão REF-002 — Auditar acoplamento Calendário V2 → Gantt

**Status:** `[x] CONCLUÍDA`

#### Tarefas

- [x] Inventariar todos os imports de `shared/production-calendar/`.
- [x] Classificar cada export como:
  - visual exclusivo do V2;
  - utilitário neutro;
  - adapter do planejamento;
  - UI operacional reutilizada;
  - regra de negócio em local inadequado;
  - compatibilidade temporária.
- [x] Mapear `createProductionCalendarV2Renderer`.
- [x] Mapear `createPlanningScheduleRendererHost` e fallback.
- [x] Mapear `globalThis.PLANNING_SCHEDULE_RENDERER`.
- [x] Mapear `USE_PRODUCTION_CALENDAR_V2`.
- [x] Mapear uso de `ProductionCalendarEditor` e `ProductionCalendarSplitEditor`.
- [x] Mapear dependência do Gantt em `ProductionCalendarCard.js`.
- [x] Mapear utilitários de dia, cor, adapter e validação.
- [x] Mapear CSS carregado automaticamente por `shared/production-calendar/index.js`.
- [x] Criar matriz de migração com destino de cada símbolo.

#### Saída esperada

Tabela com:

| Símbolo/arquivo atual | Categoria | Consumidores | Destino proposto | Pode remover quando |
|---|---|---|---|---|

#### Proibição

- Não apagar ou renomear nesta missão.

---

### Missão REF-003 — Auditar outros arquivos grandes

**Status:** `[x] CONCLUÍDA`

#### Arquivos mínimos

- [x] `services/planning.service.js`;
- [x] `pages/AnalysisPage.js`;
- [x] `pages/ImportHistoryPage.js`;
- [x] `server/routes/planning.routes.js`;
- [x] `services/planningReoptimization.service.js`;
- [x] `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`;
- [x] `style.css`;
- [x] `shared/CalendarTimeline.js`.

#### Critérios de auditoria

- quantidade de responsabilidades;
- coesão interna;
- fan-in/fan-out;
- estado mutável;
- circularidade;
- duplicação de regra;
- facilidade de teste;
- risco de compatibilidade;
- benefício real de divisão;
- prioridade.

#### Resultado permitido

Cada arquivo deve receber uma decisão:

- `DIVIDIR NESTA REESTRUTURAÇÃO`;
- `DIVIDIR DEPOIS`;
- `NÃO DIVIDIR; TAMANHO JUSTIFICADO`;
- `INVESTIGAR EM MISSÃO PRÓPRIA`.

Não alterar esses arquivos apenas por quantidade de linhas.

---

## FASE 2 — Caracterização e estabilização dos testes

**Objetivo:** criar proteção para reorganizar sem mudar comportamento.

### Missão REF-010 — Investigar as seis falhas de baseline

**Status:** `[x] CONCLUÍDA — investigação e classificação; correções pendentes`

#### Tarefas por falha

- [x] Split localizado: contrato definido; edicao de allocation preserva posicao no array do draft manual.
- [x] Recalculation: eliminar dependência da data atual.
- [x] Manual Schedule Integration: substituir inspeção textual frágil por teste de comportamento quando possível; foco Fluxo -> Gantt restaurado por `allocationId`.
- [x] Stock Partial Modal: teste restringido ao fluxo real por extracao balanceada e harness comportamental; fluxo parcial usa `manualMovePolicy: 'stock_only_independent'`.
- [x] Renderer focus: contrato confirmado; Fluxo -> Gantt foca por `allocationId` via renderer host neutro, sem seletor DOM na `PlanningPage.js`.
- [x] Day Header DOM: harness DOM completado em `tests/productionCalendarDayHeader.test.js`; teste permanece legado temporario enquanto o V2 existir.

#### Diagnósticos REF-010 concluídos

- [x] Split localizado classificado na REF-010 como contrato de ordem ainda não definido, com possível defeito funcional; contrato definido e corrigido na REF-012.
- [x] Recalculation classificado como teste dependente da data atual.
- [x] Manual Schedule Integration classificado como teste estático frágil e divergência pendente de foco Fluxo → Gantt.
- [x] Stock Partial Modal classificado como teste estático frágil por recorte incorreto.
- [x] Renderer focus classificado como divergência funcional de foco mais teste estático frágil.
- [x] Day Header DOM classificado como harness DOM incompleto e teste V2 legado.

#### Correções concluídas após REF-010

- [x] REF-010/Recalculation, evidência `docs/refactor/REF-011_PLANNING_CONSTRAINT_DATE_FIX.md`: `planningConstraintRecalculation.service.test.js` deixou de depender de datas fixas envelhecíveis, preservando a regra produtiva de passado somente leitura. Suíte evoluiu de 51 testes, 45 aprovados e 6 falhos para 51 testes, 46 aprovados e 5 falhos.
- [x] REF-012/Manual Schedule Edit Order, evidencia `docs/refactor/REF-012_MANUAL_SCHEDULE_EDIT_ORDER_FIX.md`: `editDraftAllocation` passou a substituir a allocation editada na mesma posicao do array pelo `allocationId` canonico, sem ordenacao global e sem alterar regras de movimentacao. Suite evoluiu de 51 testes, 46 aprovados e 5 falhos para 51 testes, 47 aprovados e 4 falhos.
- [x] REF-013/Flow to Gantt Focus, evidencia `docs/refactor/REF-013_FLOW_TO_GANTT_FOCUS.md`: clique/teclado no Fluxo Produtivo preserva abertura dos detalhes e solicita foco por `allocationId` ao `planningScheduleRendererHost`; `PlanningPage.js` nao acessa DOM interno do Gantt; testes estaticos frageis foram substituidos/fortalecidos por harness comportamental. Suite evoluiu de 51 testes, 47 aprovados e 4 falhos para 51 testes, 49 aprovados e 2 falhos.

- [x] REF-014/Manual Stock Partial Modal Test, evidencia `docs/refactor/REF-014_MANUAL_STOCK_PARTIAL_MODAL_TEST.md`: `planningManualStockPartialModal.test.js` deixou de depender do delimitador removido `focusCalendarCardFromFlow`; o fluxo parcial foi protegido por harness comportamental, confirma `applyManualScheduleTransaction`, `manualMovePolicy: 'stock_only_independent'`, contexto de estoque, sucesso, rejeicao, erro e ausencia de `simulateCurrent`, `scheduleOperations` e `reoptimizePlanningFuture`. Suite evoluiu de 51 testes, 49 aprovados e 2 falhos para 51 testes, 50 aprovados e 1 falho.
- [x] REF-015/Production Calendar Day Header Harness, evidencia `docs/refactor/REF-015_PRODUCTION_CALENDAR_DAY_HEADER_HARNESS.md`: `productionCalendarDayHeader.test.js` deixou de falhar por ausencia de `querySelector` no `FakeElement`; a correcao ficou somente no harness DOM, com busca recursiva minima e seletores explicitos usados pelo grid. Suite evoluiu de 51 testes, 50 aprovados e 1 falho para 51 testes, 51 aprovados e 0 falhos.

#### Regra

Não mudar expectativa apenas para obter verde. Toda alteração precisa apontar:

- comportamento esperado;
- fonte do contrato;
- reprodução;
- por que a correção está no código ou no teste.

#### Gate

- [x] Suíte base sem falhas inexplicadas.
- [x] Falhas temporariamente aceitas têm justificativa registrada em `docs/refactor/REF-010_BASELINE_FAILURE_INVESTIGATION.md`.

**Gate para correção dos testes:** liberado com escopo controlado por falha.  
**Baseline automatizado:** verde em 51/51 apos REF-015.  
**Gate para extração da `PlanningPage.js`:** liberado por `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md`, com baseline 51/51 confirmado em 2026-08-07 e checkpoint manual pendente para o Gu executar antes da primeira extracao. Homologacao manual da REF-013 permanece pendente.

#### Checkpoint tecnico REF-020

- [x] Baseline automatizado reconfirmado: 51 testes, 51 aprovados e 0 falhos.
- [x] Worktree inventariado: 41 arquivos rastreados modificados e 68 arquivos nao rastreados antes do documento de evidencia; 69 no estado final da missao, incluindo `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md`.
- [x] Arquivos funcionais, testes, migration, Gantt APS, services novos e documentacao REF identificados.
- [x] `.env` confirmado como sensivel protegido por `.gitignore`, sem abrir nem expor conteudo.
- [x] Residuos em `tmp/` classificados como nao versionar.
- [x] Estrategia de checkpoint manual registrada.
- [ ] Checkpoint Git manual criado pelo Gu.
- [ ] Homologacao manual REF-013 concluida. Tentativa em 2026-08-12 executou servidor local e Chrome real ate a tela de login, mas nao havia sessao autenticada/dados operacionais; status registrado: NAO EXECUTADA POR LIMITACAO DE AMBIENTE.
- [x] Gate de refatoracao liberado para primeira extracao apos checkpoint manual.
- [x] Primeira extracao recomendada definida: helpers puros de formatacao/normalizacao (`formatDateOnly`, `formatPeriod`, `parsePtBrDecimal`, `escapeHtml`, `normalizeText`, `normalizeJsonArray`, `normalizeJsonObject`, `formatPtBrDecimal`, `formatPtBrInteger`) para `shared/planning-presentation/planningFormatters.js`.
- [x] REF-021 concluida: primeira extracao cirurgica de formatadores/normalizadores puros para `shared/planning-presentation/planningFormatters.js`; commit-base `5f7b69c`; suite final `node --test tests/*.js` com 52 testes, 52 aprovados e 0 falhos.
- [x] Funcoes extraidas na REF-021: `formatDateOnly`, `formatPeriod`, `parsePtBrDecimal`, `escapeHtml`, `normalizeText`, `normalizeJsonArray`, `normalizeJsonObject`, `formatPtBrDecimal`, `formatPtBrInteger`.
- [x] REF-022 concluida: extracao cirurgica de helpers puros de duracao e horario para `shared/planning-presentation/planningTimeFormatters.js`; commit-base `c404baf`; suite final `node --test tests/*.js` com 53 testes, 53 aprovados e 0 falhos.
- [x] Funcoes extraidas na REF-022: `formatDuration`, `formatHourDuration`, `minutesToTime`, `timeToMinutes`.
- [x] REF-023 concluida: extracao cirurgica de helpers neutros de data civil/calendario para `shared/planning-date/planningCivilDate.js`; commit-base `3650829`; contagem canonica por Node; suite final registrada em `docs/refactor/REF-023_PLANNING_CIVIL_DATE_EXTRACTION.md`. Correcao factual: `dateOnlyFromDate` e `parseDateOnly` nao sao puras/deterministicas para todos os inputs, pois preservam fallback legado para `new Date()` em entradas invalidas/vazias.
- [x] Funcoes extraidas na REF-023: `dateOnlyFromDate`, `parseDateOnly`, `addCalendarMonths`, `isWeekendDate`.
- [x] REF-024 concluida: auditoria e centralizacao de `isValidDateOnly` no modulo `shared/planning-date/planningCivilDate.js`; commit-base `d7a7c20`; worktree inicial limpo; baseline inicial e suite final `node --test tests/*.js` com 54 testes, 54 aprovados e 0 falhas; contagem canonica final da `PlanningPage.js`: 7137 linhas.
- [x] Funcoes extraidas na REF-024: somente `isValidDateOnly`. Nenhuma outra extracao foi autorizada ou executada.
- [x] REF-025 concluida: auditoria do bloco arquitetural `planningLookups` no commit-base `aae0dfb`; funcoes candidatas auditadas incluíram `materialById`, `matchingMatrix`, `productionMaterialOptions`, `materialMatches`, `findSimulationOperation`, `treeForProductionIndex`, `matchingDropOption`, selectors de calendario/manual, estoque, fluxo e detalhes. Foram rejeitadas funcoes com API, DOM, draft mutavel, payload, calendario manual, transporte, estoque, arvore produtiva, persistencia, precedencia ou IDs sensiveis.
- [x] Funcoes extraidas na REF-025: `findMaterialById`, `selectMatchingMatrixRows`, `selectProductionMaterialOptions`, `materialMatchesSearch` para `shared/planning-domain/planningLookups.js`; suite final `node --test tests/*.js` com 55 testes, 55 aprovados e 0 falhas; contagem canonica final da `PlanningPage.js`: 7099 linhas.
- [x] Proxima fronteira recomendada apos REF-025, sem execucao: auditar e, se seguro, extrair apenas `productionCalendarParentOperationId` e seus normalizadores imediatos para modulo de identidade de calendario manual, preservando IDs legados.
- [x] REF-026 concluida: auditoria do bloco arquitetural `planningScheduleSnapshot`; fronteira segura limitada a helpers de leitura/derivacao (`buildTimelineOperations`, `selectProductionCalendarMachines`, `resolveProductionCalendarPlanningId`, `mergeDraftAllocationDays`, `buildManualScheduleIssueMessages`, `buildProductionCalendarValidationSnapshot`) em `shared/planning-domain/planningScheduleSnapshot.js`.
- [x] Funcoes rejeitadas na REF-026: `buildProductionCalendarSnapshot`, `currentProductionCalendarSnapshot`, `currentManualScheduleValidationContext`, `withManualTransportPresentation`, `findProductionCalendarMachine` e `validateProductionCalendarMoveIntent`, por acoplamento com closure, validacao produtiva, transporte, movimento manual, estado visual, permissoes, historico, estoque ou efeitos colaterais.
- [x] Baseline/validacao REF-026: baseline inicial `5923c5e`, worktree limpo, `node --test tests/*.js` com 55/55; teste novo `tests/planningScheduleSnapshot.test.js`; suite final com 56/56; contagem canonica da `PlanningPage.js` reduziu de 7099 para 7016 linhas.
- [x] REF-027 concluida: auditoria do bloco arquitetural `planningPayloadBuilder`; fronteira segura limitada a construcao pura de payloads (`buildProductionPayload`, `buildStockOnlyMaterialsForPayload`, `buildShiftPayload`, `buildPlanningSimulationPayload`, `buildNormalizedPlanningPayload`) em `shared/planning-domain/planningPayloadBuilder.js`.
- [x] Funcoes rejeitadas/retidas na REF-027: `simulatePlanningRequest`, `saveDraftNow`, `queueAutosave`, `simulateCurrent`, save/launch, `hydrateProductionDefaults` e wrappers `productionPayload`/`payload` completos permaneceram na pagina por API/save/persistencia, mutacao de defaults, leitura de closure ou regra produtiva.
- [x] Baseline/validacao REF-027: baseline inicial `804669b`, worktree limpo, `node --test tests/*.js` com 56/56; teste novo `tests/planningPayloadBuilder.test.js`; suite final com 57/57; contagem canonica da `PlanningPage.js` reduziu de 7016 para 6990 linhas.
- [x] REF-028 concluida: auditoria do bloco arquitetural `planningFlowModel`; fronteira segura limitada ao modelo puro de leitura do fluxo produtivo (`selectProductionFlowTrees`, `resolveFlowNodeModelName`, `buildFlowNodeKey`, `normalizeFlowQuantities`, `buildPlanningFlowGraph`) em `shared/planning-domain/planningFlowModel.js`.
- [x] Funcoes rejeitadas/retidas na REF-028: `renderFlowNodeCard`, `renderFlowGraph`, `drawProductionFlowConnectors`, `renderProductionFlows`, `renderFlowTree`, `renderPlanFlowDetail`, `resolvePlanningFlowAllocation`, `focusPlanningFlowAllocation`, `planningFlowNodeStockBalanceChecked` e `stockOnlyMaterialsFromSimulation` permaneceram na pagina por HTML/DOM/SVG/modal/foco/Gantt/estoque/interacao.
- [x] Baseline/validacao REF-028: baseline inicial `f38b266`, worktree limpo, `node --test tests/*.js` com 57/57; teste novo `tests/planningFlowModel.test.js`; suite final com 64/64; `git diff --check` OK; contagem canonica da `PlanningPage.js` reduziu de 6990 para 6832 linhas.
- [x] REF-029 concluida: auditoria e extracao da apresentacao HTML/string do Flow para `shared/planning-presentation/planningFlowView.js`; baseline inicial `3d8f8ce`, worktree limpo, `node --test tests/*.js` com 64/64, contagem inicial da `PlanningPage.js`: 6832 linhas.
- [x] Funcoes extraidas na REF-029: `renderFlowNodeCard`, implementacao HTML de `renderFlowGraph`, `renderFlowTree` e helpers privados de apresentacao `flowNodeStatus`, `nodeUsesStockBalance`, `renderStockBalanceInfo`. `PlanningPage.js` manteve adapter fino para injetar `buildFlowGraph`, tema e escolhas de estoque.
- [x] Funcoes rejeitadas/retidas na REF-029: `renderProductionFlows`, `drawProductionFlowConnectors`, `renderPlanFlowDetail`, eventos click/keyboard, modal/detalhes, `resolvePlanningFlowAllocation`, `focusPlanningFlowAllocation`, Gantt, estoque/toggle operacional, movimento manual e split.
- [x] Testes REF-029: criado `tests/planningFlowView.test.js`; ajuste estritamente necessario em `tests/productionDisplayColor.test.js`; sintaxe de `planningFlowView` e `PlanningPage` aprovada; teste focado aprovado; suite final registrada em `docs/refactor/REF-029_PLANNING_FLOW_VIEW_EXTRACTION.md`; contagem canonica da `PlanningPage.js` reduziu de 6832 para 6756 linhas.
- [x] REF-030 concluida: auditoria e extracao da camada DOM/SVG do Flow ja renderizado para `shared/planning-presentation/planningFlowDom.js`; baseline inicial `0cb5a18`, worktree limpo, `node --test tests/*.js` com 68/68, contagem inicial da `PlanningPage.js`: 6756 linhas.
- [x] Funcoes extraidas na REF-030: `drawProductionFlowConnectors`, `scheduleProductionFlowConnectors` e `renderProductionFlowDom`. A pagina passou a injetar `page`, `requestAnimationFrame` e `productionTheme` explicitamente.
- [x] Funcoes rejeitadas/retidas na REF-030: `renderProductionFlows`, eventos click/keyboard, abertura de modal, `renderPlanFlowDetail`, `resolvePlanningFlowAllocation`, `focusPlanningFlowAllocation`, integracao Flow -> Gantt, estoque/toggle operacional, Calendario V2, movimento manual e split.
- [x] Testes REF-030: criado `tests/planningFlowDom.test.js`; ajuste estritamente necessario em `tests/productionDisplayColor.test.js`; sintaxe de `planningFlowDom` e `PlanningPage` aprovada; teste focado aprovado; suite final `node --test tests/*.js` com 73/73; `git diff --check` OK com avisos LF/CRLF; contagem canonica da `PlanningPage.js` reduziu de 6756 para 6713 linhas.
- [x] REF-031 concluida: auditoria e extracao dos eventos click/keyboard do Flow para `shared/planning-presentation/planningFlowEvents.js`; baseline inicial `f29c4fb`, worktree limpo, `node --test tests/*.js` com 73/73, contagem inicial da `PlanningPage.js`: 6713 linhas.
- [x] Funcoes extraidas na REF-031: `bindPlanningFlowEvents` e `extractPlanningFlowNodeData`. A pagina passou a injetar `root: target` e callback `onActivateNode`, mantendo abertura de detalhes antes de solicitar foco.
- [x] Funcoes rejeitadas/retidas na REF-031: `openFlowNodeDetailsModal`, `renderPlanFlowDetail`, `resolvePlanningFlowAllocation`, `focusPlanningFlowAllocation`, integracao Flow -> Gantt, renderer/Gantt, estoque operacional, draft/state, API, persistencia, Calendario V2, movimento manual e split.
- [x] Testes REF-031: criado `tests/planningFlowEvents.test.js`; sintaxe de `planningFlowEvents` e `PlanningPage` aprovada; teste focado aprovado; suite final `node --test tests/*.js` com 82/82; `git diff --check` OK com avisos LF/CRLF; contagem canonica da `PlanningPage.js` reduziu de 6713 para 6707 linhas.
- [x] REF-032 concluida: auditoria e extracao do controlador neutro de historico manual para `shared/planning-controller/planningHistoryController.js`; baseline inicial `85e6ff8`, worktree limpo, `node --test tests/*.js` com 82/82, contagem inicial da `PlanningPage.js`: 6707 linhas.
- [x] Funcoes/blocos extraidos na REF-032: orquestracao de `record`, `reset`, `resetFromCurrent`, `undo`, `redo`, `canUndo`, `canRedo` e `getHistory` sobre `services/manualScheduleHistory.service.js`, com callbacks explicitos de captura/restauracao.
- [x] Funcoes rejeitadas/retidas na REF-032: `cloneDraftPlanningState`, `restoreDraftPlanningState`, re-render DOM do Flow, `saveDraftNow`, `refreshTimelineOnly`, API, solver, reotimizacao, movimento, split, transporte, estoque, persistencia, Gantt, Calendario V2 e capacidade.
- [x] Testes REF-032: criado `tests/planningHistoryController.test.js`; ajuste estritamente necessario em `tests/manualScheduleHistory.service.test.js`; sintaxe de `planningHistoryController` e `PlanningPage` aprovada; testes focados aprovados; suite final `node --test tests/*.js` com 83/83; `git diff --check` OK com avisos LF/CRLF; contagem canonica da `PlanningPage.js` reduziu de 6707 para 6699 linhas.
- [x] REF-033 concluida: auditoria e extracao do controlador read-only de projecao de estoque para `shared/planning-controller/planningStockProjectionController.js`; baseline inicial `14fa4a3`, worktree limpo, `node --test tests/*.js` com 83/83, contagem inicial da `PlanningPage.js`: 6699 linhas.
- [x] Funcoes/blocos extraidos na REF-033: `getPlanningStockProjectionDay`, modelo read-only de modal, alerta agregado de calendario e montagem explicita da entrada para `projectPlanningStockByDay`. A pagina manteve DOM/modal, DataTable, foco, toast e origem `localStorage` dos thresholds.
- [x] Funcoes rejeitadas/retidas na REF-033: `openPlanningStockProjectionModal`, `readStockMinimumDays`, `readPcpIdealDays`, helpers do fluxo legado por API, `planningManualStockPartialModal`, stock-only move/toggle, draft mutavel, split/editor, transporte, persistencia/save, solver/reotimizacao, Gantt, Calendario V2, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade.
- [x] Testes REF-033: criado `tests/planningStockProjectionController.test.js`; sintaxe de `planningStockProjectionController` e `PlanningPage` aprovada; testes focados e canonicos de estoque/projecao/modal aprovados; suite final `node --test tests/*.js` com 84/84; `git diff --check` OK com avisos LF/CRLF; contagem canonica da `PlanningPage.js` reduziu de 6699 para 6610 linhas.
- [x] REF-034 concluida: auditoria e extracao do controlador de transporte manual para `shared/planning-controller/planningTransportController.js`; baseline inicial `6c9acab`, worktree limpo, `node --test tests/*.js` com 84/84, contagem inicial da `PlanningPage.js`: 6610 linhas.
- [x] Funcoes/blocos extraidos na REF-034: identidade e lookup de transporte manual, escopo downstream por dependencias/memberships, calculo de chegada/horas, montagem de constraints `MANUAL_TRANSPORT`/pins, apresentacao `manualTransport` e orquestracao de save por callbacks explicitos. A pagina manteve DOM/modal/eventos/foco e estado visual.
- [x] Funcoes rejeitadas/retidas na REF-034: `emptyTransport`, normalizacao de `production.transports`, `transportsFromOperations`, `buildManualScheduleValidationContext`, `openProductionCalendarTransportModal`, save/load efetivo, API, services, solver interno, manual move/split, estoque, stock-only, Gantt, Calendario V2, Flow, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade.
- [x] Testes REF-034: criado `tests/planningTransportController.test.js`; ajustados testes estaticos estritamente relacionados; sintaxe de `planningTransportController` e `PlanningPage` aprovada; testes focados e relacionados de memberships, reotimizacao, validacao, persistencia e save/load aprovados; suite final `node --test tests/*.js` com 85/85; `git diff --check` OK com avisos LF/CRLF; contagem canonica da `PlanningPage.js` reduziu de 6610 para 6265 linhas.
- [x] REF-035 concluida: auditoria e extracao parcial do controlador de persistencia manual para `shared/planning-controller/planningPersistenceController.js`; baseline inicial `815c74c`, worktree limpo, `node --test tests/*.js` com 85/85, contagem inicial da `PlanningPage.js`: 6265 linhas.
- [x] Funcoes/blocos extraidos na REF-035: montagem de payload `POST /planning/plans`, montagem de payload `PUT /planning/plans/:id/manual-schedule` com `expectedRevision`, orquestracao de save por callbacks explicitos e montagem de estado de reopen a partir de `normalizePersistedManualScheduleDraft`.
- [x] Funcoes rejeitadas/retidas na REF-035: `saveDraftNow`, `queueAutosave`, `discardAllProductionCalendarChanges`, `prepareAutomaticBaselineDiscard`, `prepareCurrentSimulationManualDiscard`, pre-validacao produtiva com `applyManualScheduleTransaction`, criacao de baseline automatica no reopen, reset de historico, modal, toast, navegacao, render, API direta, services/backend/database, solver/reotimizacao, manual move/split, transporte, estoque, stock-only, Gantt, Calendario V2, Flow, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade.
- [x] Testes REF-035: criado `tests/planningPersistenceController.test.js`; ajustado teste estatico estritamente relacionado em `tests/automaticSimulationBaseline.service.test.js`; sintaxe de `planningPersistenceController`, `PlanningPage` e teste novo aprovada; testes focados e canonicos de persistencia/save-load aprovados; suite final `node --test tests/*.js` com 86/86; contagem canonica da `PlanningPage.js` reduziu de 6265 para 6212 linhas.
- [x] REF-036 concluida: auditoria e extracao do controlador de movimentacao manual de allocations para `shared/planning-controller/planningManualMoveController.js`; baseline inicial `0f72af3`, worktree limpo, `node --test tests/*.js` com 86/86, contagem inicial da `PlanningPage.js`: 6212 linhas.
- [x] Funcoes/blocos extraidos na REF-036: montagem da operacao canonica `MOVE_ALLOCATION`, preservando `allocationId`, destino, maquina, pessoas, origem e `manualMovePolicy`; execucao transacional por `applyManualScheduleTransaction`; aceite/rejeicao/cancelamento por callbacks explicitos; diagnostics e `manualMoveStockAnalysis` preservados.
- [x] Funcoes rejeitadas/retidas na REF-036: `handleProductionCalendarMoveRequest`, `validateProductionCalendarMoveIntent`, `confirmManualMoveConfiguration`, callbacks pos-aceite (`recordAcceptedManualState`, `saveDraftNow`, `refreshTimelineOnly`, toast e limpeza de selecao), modais de estoque, rejeicao visual, `buildManualMoveCandidateDraft`, split/editor/capacidade, transporte, persistencia, autosave/descarte, Gantt renderer, Calendario V2, solver/reotimizacao, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade.
- [x] Testes REF-036: criado `tests/planningManualMoveController.test.js`; ajustado teste estatico estritamente relacionado em `tests/planningManualScheduleIntegration.test.js`; sintaxe de `planningManualMoveController` e `PlanningPage` aprovada; testes focados e relacionados de transacao, validacao, integracao manual e Gantt aprovados; suite final registrada em `docs/refactor/REF-036_PLANNING_MANUAL_MOVE_CONTROLLER_EXTRACTION.md`; contagem canonica da `PlanningPage.js` reduziu de 6212 para 6136 linhas.
- [x] REF-037 concluida: auditoria e extracao do controlador de split/editor de allocation para `shared/planning-controller/planningAllocationEditorController.js`; baseline inicial `0baec24`, worktree limpo, `node --test tests/*.js` com 87/87, contagem inicial da `PlanningPage.js`: 6136 linhas.
- [x] Funcoes/blocos extraidos na REF-037: montagem das operacoes canonicas `EDIT_ALLOCATION` e `SPLIT_ALLOCATION`, execucao por `applyManualScheduleTransaction`, retorno de aceite/rejeicao/stale/no-op, diagnostics preservados e aplicacao do draft aceito somente por callback explicito.
- [x] Funcoes rejeitadas/retidas na REF-037: abertura/fechamento dos editores, `ProductionCalendarEditor`, `ProductionCalendarSplitEditor`, preview de produtividade, modal de capacidade, ramo de troca de recurso com reotimizacao, `acceptRecalculatedCalendar`, historico/save/render/toast, transporte, stock-only, persistencia, autosave/descarte, Gantt, Calendario V2 renderer/grid, solver/reotimizacao, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade global.
- [x] Testes REF-037: criado `tests/planningAllocationEditorController.test.js`; ajustados testes estaticos estritamente relacionados em `tests/planningReoptimization.service.test.js` e `tests/productionCalendarEditButton.test.js`; sintaxe do controller e da `PlanningPage` aprovada; testes focados e relacionados de split/editor/configuracao/capacidade aprovados; suite final registrada em `docs/refactor/REF-037_PLANNING_ALLOCATION_EDITOR_CONTROLLER_EXTRACTION.md`; contagem canonica da `PlanningPage.js` reduziu de 6136 para 6134 linhas.
- [x] REF-038 concluida: neutralizacao inicial das dependencias do Calendario V2 com auditoria de PlanningPage, renderer/factory, Gantt APS, editor/split, adapter, `productionDisplayColor`, utilities e fallback; evidencia em `docs/refactor/REF-038_CALENDARIO_V2_COUPLING_NEUTRALIZATION.md`.
- [x] Bloco neutralizado na REF-038: `productionDisplayColor` e o resolvedor puro `getProductionCalendarAllocationColor` foram movidos para `shared/planning-presentation/productionDisplayColor.js`; o Gantt deixou de importar `ProductionCalendarCard.js`; re-exports legados preservam compatibilidade.
- [x] Testes REF-038: baseline inicial `node --test tests/*.js` com 95/95; validacoes finais focadas de renderer, Gantt, editor, split, grid e cor; suite final 95/95; `git diff --check` sem falhas.
- [x] REF-039 concluida: helpers neutros de maquina `normalizeProductionCalendarMachineName` e `compareProductionCalendarMachineOrder` foram auditados e movidos para `shared/planning-schedule/planningMachineOrder.js`; evidencia em `docs/refactor/REF-039_MACHINE_HELPERS_NEUTRALIZATION.md`.
- [x] Consumidores REF-039 encontrados: `ganttAps.geometry.js`, `createProductionCalendarGridRows`, `productionCalendar.adapter.js`, barrel `shared/production-calendar/index.js` e testes de Gantt/grid/utilities.
- [x] Gate REF-039: sem DOM/render V2, sem estado V2, sem regra especifica V2, API preservada por re-export, movimentacao mecanica sem mudanca de comportamento.
- [x] Neutralizacao REF-039: cadeia `Gantt geometry -> productionCalendar.utils.js` substituida por `Gantt geometry -> shared/planning-schedule/planningMachineOrder.js`; `productionCalendar.utils.js` mantem re-export temporario.
- [x] REF-040 concluida: adapter compartilhado de schedule auditado e movido para `shared/planning-schedule/planningScheduleAdapter.js`; evidencia em `docs/refactor/REF-040_SCHEDULE_ADAPTER_NEUTRALIZATION.md`.
- [x] Baseline REF-040: branch `rebuild-production-calendar`, HEAD `9f44924`, worktree limpo, `node --test tests/*.js` inicial com 96/96.
- [x] Exports REF-040 auditados: `adaptPlanningResultToProductionCalendar`, `buildProductionStageIndex`, `buildProductionMembershipIndex` e helpers privados internos do adapter.
- [x] Mapa de identidade REF-040 registrado: `allocationId`, `operationId`, `productionId`, `calendarParentOperationId`, `parentOperationId`, IDs `readonly:*`, IDs derivados/fallback, `memberships`, `machineId`, `sequence` e `stage`; `parentAllocationId`, `splitParentId` e `splitOrder` preservados como ausencia atual do adapter.
- [x] Fronteira neutra REF-040 encontrada: nucleo sem DOM, sem estado visual V2, sem API, sem scheduler, sem persistencia e sem alteracao comportamental.
- [x] Neutralizacao REF-040: cadeia `PlanningPage.js -> production-calendar/index.js -> productionCalendar.adapter.js` substituida por `PlanningPage.js -> shared/planning-schedule/planningScheduleAdapter.js`.
- [x] Re-export REF-040: `shared/production-calendar/productionCalendar.adapter.js` mantem `adaptPlanningResultToProductionCalendar` como compatibilidade legada para consumidores V2 antigos.
- [x] Testes REF-040: teste neutro `tests/planningScheduleAdapter.test.js` criado; validacoes focadas e suite completa registradas no historico da missao.
- [ ] `productiveMinutes` permanece pendente.
- [ ] `generatePlanningCode` permanece nao autorizado.
- [ ] Helpers de turno (`defaultShift`, `normalizeShiftTimes` e relacionados) permanecem pendentes.
- [ ] REF-013 homologacao manual permanece pendente.
- [ ] Calendario V2 permanece pendente.
- [ ] Identidade do calendario manual permanece pendente.
- [ ] Split/editor com reotimizacao de recurso e desacoplamento visual do pacote V2 permanece pendente.
- [ ] Persistencia ampla/autosave/descarte permanece pendente.
- [ ] Stock-only/movimento de estoque permanece pendente.

---

### Missão REF-011 — Criar cenários de caracterização do planejamento

**Status:** `[ ] PARCIAL`

#### Cenários mínimos

- [ ] simulação simples com uma produção;
- [ ] árvore com intermediário;
- [ ] estoque parcial;
- [ ] falta de estoque integral da parcela diária;
- [ ] múltiplas máquinas compatíveis;
- [ ] produtividade por pessoas;
- [ ] divisão com resíduo;
- [ ] movimento manual aceito;
- [ ] movimento manual rejeitado e rollback;
- [ ] dia não útil/manualWorkDate;
- [ ] dailyTeamOverride;
- [ ] transporte;
- [ ] reotimização com passado congelado;
- [ ] save/reopen;
- [ ] conflito de revisão;
- [ ] planejamento legado normalizado;
- [ ] produção separada por `productionBreakdown`.

#### Saída

Criar fixtures ou builders reutilizáveis, sem depender da data atual ou de banco externo quando não necessário.

---

### Missão REF-012 — Criar contrato de paridade visual/operacional do Gantt

**Status:** `[ ] PARCIAL`

Nota REF-051: a REF-051 produziu evidencia tecnica parcial da matriz V2 -> Gantt, e varias capacidades ja possuem testes tecnicos. A matriz/homologacao completa ainda nao esta encerrada; REF-013/manual browser homologation continua pendente. Esta REF nao marca os checkboxes de homologacao como concluidos e nao altera REF-012 para concluida.

#### Matriz obrigatória

| Capacidade | V2 atual | Gantt atual | Fonte da ação | Teste técnico | Homologação Gu | Pendência |
|---|---|---|---|---|---|---|

#### Capacidades mínimas

- [ ] renderização;
- [ ] máquina sem produção;
- [ ] produção separada;
- [ ] memberships;
- [ ] cores;
- [ ] inspector;
- [ ] foco externo;
- [ ] zoom;
- [ ] horizonte;
- [ ] fullscreen;
- [ ] movimentação horizontal;
- [ ] feedback de destino;
- [ ] rejeição/rollback;
- [ ] edição;
- [ ] divisão;
- [ ] transporte;
- [ ] equipe/capacidade;
- [ ] dias extraordinários;
- [ ] undo/redo;
- [ ] descarte;
- [ ] diagnósticos;
- [ ] estoque por data;
- [ ] save/reopen;
- [ ] responsividade mínima web/mobile.

---

## FASE 3 — Criar fronteiras neutras antes de remover o V2

**Objetivo:** retirar do pacote V2 tudo que é usado como base do produto.

### Missão REF-020 — Extrair identidade visual de produção

**Status:** `[x] CONCLUIDA VIA REF-038`

#### Situação atual

Cores e helpers viviam em `shared/production-calendar/productionDisplayColor.js`, e o Gantt importava cor por meio de `ProductionCalendarCard.js`.

Atualizacao REF-038: a implementacao canonica foi movida para `shared/planning-presentation/productionDisplayColor.js`; o caminho antigo permanece como re-export temporario.

#### Destino sugerido

```text
shared/planning-presentation/
├── productionDisplayColor.js
├── productionIdentity.js
└── index.js
```

#### Tarefas

- [x] mover helpers neutros de cor;
- [x] mover cálculo neutro de cor da allocation;
- [x] remover import do Gantt vindo de `ProductionCalendarCard.js`;
- [x] manter re-export temporário no caminho antigo, se necessário;
- [x] migrar PlanningPage, Gantt e testes diretamente afetados;
- [x] preservar cores persistidas;
- [x] preservar fallback determinístico;
- [x] provar que nenhuma cor do draft é mutada.

#### Gate

O Gantt não importa nenhum componente visual do V2 para resolver cor.

---

### Missao REF-039 - Neutralizar helpers de maquina usados pelo Gantt

**Status:** `[x] CONCLUIDA`

#### Situacao inicial

`ganttAps.geometry.js` importava `compareProductionCalendarMachineOrder` de `shared/production-calendar/productionCalendar.utils.js`, mantendo a cadeia:

```text
Gantt geometry
-> productionCalendar.utils.js
```

#### Auditoria e consumidores

Consumidores diretos encontrados:

- `shared/planning-schedule-view/gantt-aps/ganttAps.geometry.js`;
- `shared/production-calendar/productionCalendar.adapter.js`;
- `createProductionCalendarGridRows` em `shared/production-calendar/productionCalendar.utils.js`;
- `shared/production-calendar/index.js`;
- testes de Gantt, grid e utilities.

Gate dos helpers:

- usados fora do V2: sim;
- DOM/render V2: nao;
- estado V2: nao;
- regra especifica do Calendario V2: nao;
- API preservavel: sim;
- movimentacao sem mudanca de comportamento: sim.

#### Resultado

Implementacao canonica movida para `shared/planning-schedule/planningMachineOrder.js`.

`productionCalendar.utils.js` mantem re-export temporario de:

- `normalizeProductionCalendarMachineName`;
- `compareProductionCalendarMachineOrder`.

O Gantt agora usa:

```text
Gantt geometry
-> shared/planning-schedule/planningMachineOrder.js
```

#### Testes

Baseline inicial da REF-039: branch `rebuild-production-calendar`, HEAD `2b345c0`, worktree limpo, `node --test tests/*.js` com 95/95.

Validacoes finais registradas no historico desta missao.

---

### Missão REF-021 — Renomear e extrair adapter neutro do schedule

**Status:** `[ ] PENDENTE`

#### Situação atual

`adaptPlanningResultToProductionCalendar` é usado para construir alocações que alimentam também o Gantt.

#### Destino sugerido

```text
services/planningScheduleAdapter.service.js
```

ou

```text
shared/planning-schedule/planningSchedule.adapter.js
```

A localização final deve respeitar se o adapter é domínio ou projeção de UI.

#### Tarefas

- [ ] definir contrato neutro de snapshot;
- [ ] preservar todos os IDs e memberships;
- [ ] criar nome neutro, por exemplo `adaptPlanningResultToScheduleSnapshot`;
- [ ] manter re-export temporário compatível;
- [ ] migrar consumidores;
- [ ] renomear testes por comportamento, não por V2;
- [ ] confirmar que o retorno continua aceito pelo view model.

---

### Missão REF-022 — Extrair utilitários neutros de calendário/dia

**Status:** `[ ] PENDENTE`

#### Candidatos atuais

- `buildProductionCalendarDayPresentation`;
- `buildProductionCalendarDayProductivity`;
- `extendProductionCalendarDayRange`;
- `fillProductionCalendarDayRange`;
- normalização de dia útil;
- formatação que não dependa do DOM do V2.

#### Destino sugerido

```text
shared/planning-schedule/
├── planningScheduleDay.js
├── planningScheduleRange.js
└── planningSchedulePresentation.js
```

#### Regra

Não mover regra de calendário produtivo de services para shared. Helpers de apresentação podem ser neutros; decisão produtiva continua nos services canônicos.

---

### Missão REF-023 — Separar editor operacional do renderer V2

**Status:** `[x] CONCLUIDA pela REF-042`

#### Situação atual

`ProductionCalendarEditor` e `ProductionCalendarSplitEditor` são usados pela página para editar dados que também aparecem no Gantt.

#### Decisão necessária

- renomear como UI neutra de edição de alocação;
- ou substituir por modais próprios do planejamento/Gantt;
- nunca manter o nome V2 como dependência permanente.

#### Destino sugerido

```text
features/planning/schedule-editor/
├── PlanningAllocationEditor.js
├── PlanningAllocationSplitEditor.js
└── planningAllocationEditor.css
```

#### Gate

A edição operacional pode ser aberta a partir do fluxo do Gantt sem importar `shared/production-calendar/`.

#### REF-042 - Resultado registrado em 10/08/2026

- Baseline: branch `rebuild-production-calendar`, HEAD `8cd1dbc`, worktree limpo, suite inicial `node --test tests/*.js` com 98/98.
- Consumidores confirmados: `PlanningPage.js` abre o editor neutro em edicao de allocation e em confirmacao de movimento manual; `ProductionCalendarSplitEditor` permanece sem consumidor produtivo direto confirmado, mas testado/exportado para compatibilidade.
- Gate: `PlanningAllocationEditor` passou no gate apos receber `getDistributionPreview` por callback explicito; `PlanningAllocationSplitEditor` passou como componente legado/compatibilidade apos receber `getSplitPreview` por callback explicito.
- Dependencia CSS: classes `production-calendar-editor-*` e seletores `data-editor-preview`, `data-split-*` e `data-part-*` foram preservados; CSS nao foi movido nem renomeado.
- Extracao realizada: criados `shared/planning-editor/PlanningAllocationEditor.js`, `PlanningAllocationSplitEditor.js`, `planningAllocationDisplay.js`, `planningAllocationEditorFormatters.js` e `index.js`.
- Compatibilidade: caminhos antigos `shared/production-calendar/ProductionCalendarEditor.js` e `ProductionCalendarSplitEditor.js` viraram wrappers/re-exports temporarios com nomes `ProductionCalendar*`.
- Testes REF-042: sintaxe dos novos editores, wrappers e `PlanningPage.js`; testes focados de edit/split/configuracao/capacidade/controller/reotimizacao; suite completa e `git diff --check` registrados em `docs/refactor/REF-042_PLANNING_EDITOR_VISUAL_NEUTRALIZATION.md`.
- Blockers restantes para desligar V2: REF-013 homologacao manual, renderer/fallback V2, `ProductionCalendar`/grid, CSS V2 ou CSS compartilhado dos modais, helpers V2 puros, `productiveMinutes`, turnos/capacidade, stock-only, identidade manual restante, autosave/descarte e `generatePlanningCode`.

---

## FASE 4 — Consolidar Gantt APS como calendário único

**Objetivo:** garantir funcionamento sem fallback antes de excluir o legado.

### Missão REF-030 — Fechar paridade operacional prioritária

**Status:** `[ ] PENDENTE`

Executar somente as capacidades marcadas como necessárias na matriz REF-012.

#### Regras

- Gantt emite intenções; não executa regras produtivas.
- `PlanningPage`/controller encaminha intenção para services canônicos.
- Ação manual passa por transação e rollback.
- Erro deve aparecer ao usuário.
- Nenhum fallback para V2 será usado para “esconder” problema.

#### Gate

Todas as ações essenciais do PCP definidas para a versão 1 são acessíveis usando o Gantt.

---

### Missão REF-031 — Corrigir lifecycle, foco, zoom e fullscreen

**Status:** `[ ] PENDENTE`

#### Tarefas

- [ ] `mount` seguro;
- [ ] `update` sem duplicar listeners;
- [ ] `focusAllocation` por identidade canônica;
- [ ] `getViewportState` completo;
- [ ] `destroy` remove listeners/timers/overlays;
- [ ] fullscreen preserva estado visual;
- [ ] zoom não recalcula o APS;
- [ ] horizonte não chama API/simulação;
- [ ] foco Fluxo → Gantt decidido e testado;
- [ ] erro de renderer exibido de forma controlada.

---

### Missão REF-032 — Ativar Gantt-only sem apagar V2

**Status:** `[ ] PARCIAL`

#### Alterações esperadas

- [ ] remover seleção `auto` da página de produção;
- [x] montar explicitamente `gantt-aps`;
- [x] impedir fallback para V2;
- [x] manter arquivos V2 temporariamente no repositório, sem runtime operacional do Planejamento;
- [ ] exibir estado de erro quando o Gantt falhar;
- [x] executar regressão completa;
- [ ] homologar com o Gu.

#### Período de segurança

O V2 fica fisicamente presente, porém desligado, durante o gate de homologação. Nenhuma correção deve reativá-lo silenciosamente.

#### Gate

- [ ] fluxo completo realizado sem V2;
- [ ] nenhuma montagem do V2 em runtime;
- [ ] Gu aprova a operação essencial;
- [ ] regressão sem bloqueios.

---

## FASE 5 — Remoção definitiva do Calendário V2

**Objetivo:** eliminar o legado ativo somente depois da prova Gantt-only.

### Missão REF-040 — Remover renderer e fallback V2

**Status:** `[ ] PARCIAL`

- [x] remover `PRODUCTION_CALENDAR_V2` do enum ativo;
- [x] remover `createProductionCalendarV2Renderer`;
- [x] remover `productionCalendarV2.renderer.js`;
- [ ] simplificar renderer host para um renderer ou host genérico sem fallback legado;
- [ ] remover mensagem de rollback V2;
- [x] remover `USE_PRODUCTION_CALENDAR_V2`;
- [x] remover `globalThis.PLANNING_SCHEDULE_RENDERER` se não houver outro uso válido;
- [x] atualizar testes de lifecycle.

---

### Missão REF-041 — Remover componentes visuais V2

**Status:** `[ ] PENDENTE`

Auditoria REF-048 concluida em `docs/refactor/REF-048_PRODUCTION_CALENDAR_TREE_AUDIT.md`. REF-049 concluiu o desacoplamento runtime da `PlanningPage.js` em `docs/refactor/REF-049_PLANNING_PAGE_V2_BARREL_DECOUPLING.md`: a pagina nao importa mais `shared/production-calendar/index.js`, `renderProductionCalendarSnapshot(...)` foi removida por ausencia de caller runtime e `ProductionCalendar(...)` nao e mais montado pela pagina. REF-050 isolou o CSS do editor em `shared/planning-editor/planning-allocation-editor.css` e o loader neutro deixou de apontar para `production-calendar.css`. REF-051 removeu fisicamente o nucleo visual V2 orfao e registrou evidencia em `docs/refactor/REF-051_PHYSICAL_V2_UI_REMOVAL.md`. A remocao fisica total ainda nao pode ser marcada como concluida porque `production-calendar.css`, `productionCalendar.utils.js`, wrappers e re-exports legados continuam preservados.

Candidatos a remoção após neutralização:

- [x] `ProductionCalendar.js`;
- [x] `ProductionCalendarGrid.js`;
- [x] `ProductionCalendarToolbar.js`;
- [x] `ProductionCalendarCard.js`;
- [x] `ProductionCalendarDetails.js`;
- [x] `ProductionCalendarDrag.js`;
- [x] `ProductionCalendarState.js`;
- [x] `productionCalendar.validation.js` se for apenas visual;
- [ ] `production-calendar.css`;
- [ ] `shared/production-calendar/index.js`.

`ProductionCalendarEditor`, split, cores, adapter e utils só podem ser removidos depois de migrados ou substituídos.

Grupos REF-048:

- Grupo A/removiveis agora: nenhum arquivo, porque embora o acoplamento do barrel na `PlanningPage.js` tenha sido removido, ainda existem testes ativos, wrappers, CSS compartilhado e helpers sensiveis.
- Grupo B/wrappers legados: `ProductionCalendarEditor.js`, `ProductionCalendarSplitEditor.js`, `productionCalendar.adapter.js`, `productionDisplayColor.js` e aliases legados de `productionCalendar.utils.js`.
- Grupo C/dependencias compartilhadas: `production-calendar.css` deixou de ser dependencia do editor neutro na REF-050, mas ainda permanece para componentes/testes V2; `productionCalendar.utils.js` segue usado para dia/produtividade/horizonte e `index.js` permanece enquanto houver consumidores legados/testes; a `PlanningPage.js` deixou de depender do side effect do barrel.
- Grupo D/regra sensivel: helpers de dia/capacidade/produtividade e wrappers que chamam services canonicos de split.

REF-051 removeu em lote controlado `ProductionCalendar.js`, `ProductionCalendarGrid.js`, `ProductionCalendarToolbar.js`, `ProductionCalendarCard.js`, `ProductionCalendarDetails.js`, `ProductionCalendarDrag.js`, `ProductionCalendarState.js` e `productionCalendar.validation.js`, apos comprovar ausencia de consumidor runtime externo e ajustar testes que caracterizavam somente DOM V2.

Blockers: `production-calendar.css` continua preservado por fullscreen/diagnosticos/wrappers e limpeza propria; o editor neutro ainda preserva nomes textuais `production-calendar-editor-*` por compatibilidade visual, mas nao carrega mais `production-calendar.css`; helpers `buildProductionCalendarDayPresentation`, `buildProductionCalendarDayProductivity` e `extendProductionCalendarDayRange` ainda sao usados pelo snapshot do Planejamento por import direto preservado; wrappers/re-exports legados permanecem; REF-013 segue pendente.

---

### Missão REF-042 — Remover testes e nomes exclusivos do V2

**Status:** `[ ] PENDENTE`

- [ ] converter testes úteis para nomes neutros/Gantt;
- [ ] excluir testes que validam apenas DOM do V2;
- [ ] preservar testes de regra movendo-os para módulo neutro;
- [ ] renomear variáveis `productionCalendar*` que hoje representam schedule geral;
- [ ] renomear CSS/classes onde ainda forem parte do produto ativo;
- [ ] atualizar documentação normativa;
- [ ] arquivar histórico antigo sem tratá-lo como arquitetura atual.

#### Verificação de saída

Executar busca controlada:

```bash
rg -n "USE_PRODUCTION_CALENDAR_V2|PRODUCTION_CALENDAR_V2|production-calendar-v2|createProductionCalendarV2Renderer|Calendário V2|Calendar V2" . \
  --glob '!node_modules/**' \
  --glob '!.git/**'
```

Resultado esperado:

- zero ocorrências no código ativo;
- apenas ocorrências históricas explicitamente arquivadas, se mantidas.

---

## FASE 6 — Divisão progressiva da `PlanningPage.js`

**Objetivo:** transformar a página em orquestradora sem mudar o comportamento.

### 6.1 Estrutura-alvo inicial

A estrutura final pode ser ajustada pela auditoria, mas deve seguir uma organização próxima desta:

```text
pages/
└── planning/
    ├── PlanningPage.js
    ├── planningPage.state.js
    ├── planningPage.lifecycle.js
    ├── planningPage.api.js
    ├── planningPage.draft.js
    └── planningPage.constants.js

features/
└── planning/
    ├── production-builder/
    │   ├── planningProductionBuilder.js
    │   ├── planningProductionDetailsModal.js
    │   └── planningProductionShortage.js
    ├── flow/
    │   ├── planningFlowGraph.js
    │   ├── planningFlowRenderer.js
    │   └── planningFlowDetailsModal.js
    ├── schedule/
    │   ├── planningScheduleController.js
    │   ├── planningScheduleSnapshot.js
    │   ├── planningScheduleMove.js
    │   ├── planningScheduleEditor.js
    │   ├── planningScheduleTransport.js
    │   ├── planningScheduleOptimization.js
    │   └── planningScheduleFullscreen.js
    ├── stock/
    │   ├── planningStockProjection.js
    │   ├── planningStockProjectionModal.js
    │   └── planningManualStockMove.js
    ├── simulation/
    │   ├── planningSimulationController.js
    │   ├── planningSimulationRenderer.js
    │   └── planningLaunch.js
    └── history/
        ├── planningHistoryController.js
        └── planningPlanDetails.js

shared/
├── planning-presentation/
├── planning-schedule/
└── formatters/
```

Esta árvore é uma direção, não autorização para criar tudo de uma vez.

### 6.2 Regra de dependências

```text
PlanningPage
  → features de planejamento
  → services canônicos
  → shared neutro

features de UI
  → services canônicos
  → shared neutro

services
  NÃO importam pages/features visuais

Gantt renderer
  → view model + utilitários visuais neutros
  NÃO importa services produtivos
  NÃO importa pacote V2
```

### 6.3 Estratégia de estado

Evitar substituir a closure atual por um “contexto gigante” sem contrato.

Preferência:

1. estado explícito da página;
2. getters/setters limitados;
3. módulos de feature criados por factory com dependências claras;
4. ações retornando resultados, não mutando estado distante de forma invisível;
5. funções puras sempre que possível;
6. lifecycle `mount/update/destroy` para componentes com listeners.

Exemplo conceitual:

```js
const scheduleFeature = createPlanningScheduleFeature({
  page,
  api,
  services: {
    applyManualScheduleTransaction,
    reoptimizePlanningFuture
  },
  getState: () => state,
  updateState
});
```

Não criar um objeto `context` com centenas de campos apenas para transportar todo o monólito.

---

### Missão REF-050 — Extrair constantes, formatadores e funções puras

**Status:** `[ ] PENDENTE`

#### Candidatos iniciais

- datas e formatação;
- parsing pt-BR;
- `escapeHtml` e normalização textual, se não houver equivalente shared;
- helpers de cor já neutralizados;
- helpers de período/duração;
- validação de data civil;
- helpers puros de estoque modal;
- helpers puros do grafo de fluxo;
- comparadores e cálculos de apresentação.

#### Regras

- [ ] teste antes/depois;
- [ ] sem acesso a DOM;
- [ ] sem acesso a variáveis da closure;
- [ ] sem side effects;
- [ ] não duplicar helper existente.

---

### Missão REF-051 — Extrair estado, draft e autosave da página

**Status:** `[ ] PENDENTE`

#### Tarefas

- [ ] identificar todas as variáveis mutáveis da `PlanningPage`;
- [ ] classificar estado de domínio, estado de UI, cache e estado de viewport;
- [ ] separar persistência local do draft;
- [ ] separar normalização do draft;
- [ ] separar autosave/debounce;
- [ ] preservar chave legada local quando necessário;
- [ ] impedir que refresh reconstrua estado manual silenciosamente;
- [ ] criar teste para save/load do estado local relevante.

---

### Missão REF-052 — Extrair acesso a APIs e lookups

**Status:** `[ ] PENDENTE`

- [ ] carregamento de materiais;
- [ ] máquinas;
- [ ] matriz;
- [ ] locais;
- [ ] estoque;
- [ ] históricos;
- [ ] endpoints de planejamento;
- [ ] tratamento de loading/erro;
- [ ] nenhuma regra produtiva na camada de API;
- [ ] nenhuma mudança de payload.

---

### Missão REF-053 — Extrair Production Builder e decisões de estoque

**Status:** `[ ] PENDENTE`

#### Escopo

- formulário de produções;
- prioridade e cores;
- detalhes de produção;
- modelos produtivos;
- sugestões de materiais;
- decisões de estoque parcial/zero;
- cascade de produções ignoradas;
- avisos de produção importada.

#### Proteções

- preservar payload de simulação;
- preservar decisões por produção/material;
- preservar estoque selecionado;
- não mover regra do `planning.service.js` para UI.

---

### Missão REF-054 — Extrair Fluxo Produtivo

**Status:** `[ ] PENDENTE`

#### Escopo

- construção do grafo visual;
- merge de nós;
- níveis;
- conectores;
- legenda;
- detalhes do nó;
- vínculo com produção e cores;
- foco no Gantt, se aprovado.

#### Regra

O fluxo é projeção visual. Não deve recalcular necessidade produtiva de forma divergente do resultado da simulação.

---

### Missão REF-055 — Extrair projeção e modais de estoque

**Status:** `[ ] PENDENTE`

#### Escopo

- projeção por data;
- separação venda/produção;
- alertas PCP;
- modal de estoque;
- estoque para movimento manual;
- datas de restante;
- apresentação de insuficiência.

#### Proteções

- ledger manual e projeção analítica continuam distintos;
- regra de piso zero continua canônica;
- alertas visuais não viram bloqueios automaticamente;
- não duplicar cálculo do service.

---

### Missão REF-056 — Extrair controller do schedule/Gantt

**Status:** `[ ] PENDENTE`

#### Escopo

- construção de snapshot;
- build do view model;
- renderer lifecycle;
- estado visual;
- fullscreen;
- foco;
- alertas de calendário;
- refresh somente visual;
- callbacks do Gantt.

#### Resultado esperado

A página chama algo próximo de:

```js
scheduleController.render({ simulation, draft, permissions });
```

A página não deve conhecer detalhes de DOM interno do Gantt.

---

### Missão REF-057 — Extrair movimento, edição, split e transporte

**Status:** `[ ] PENDENTE`

#### Submódulos sugeridos

- `planningScheduleMove.js`;
- `planningScheduleAllocationEditor.js`;
- `planningScheduleSplit.js`;
- `planningScheduleTransport.js`.

#### Proteções

- movimento passa por `applyManualScheduleTransaction`;
- candidato recusado não substitui draft;
- split preserva quantidade e IDs;
- transporte preserva dependências;
- edição de recursos usa matriz canônica;
- nenhuma ação dispara simulação global sem decisão explícita.

---

### Missão REF-058 — Extrair reotimização e otimização de utilização

**Status:** `[ ] PENDENTE`

#### Proteções

- cutoff data+hora;
- passado congelado;
- decisões `pinned` e overrides;
- comparação por delta;
- aceite/rejeição explícitos;
- sem reotimização global desnecessária.

A UI só coordena e apresenta; o service continua dono da regra.

---

### Missão REF-059 — Extrair simulação, lançamento e resumo final

**Status:** `[ ] PENDENTE`

- [ ] montagem do payload;
- [ ] execução da simulação;
- [ ] aplicação de resultado;
- [ ] baseline automático;
- [ ] descarte;
- [ ] resumo;
- [ ] autorização de estoque;
- [ ] lançamento do planejamento;
- [ ] preservação de diagnósticos.

---

### Missão REF-060 — Extrair histórico e abertura de planejamento

**Status:** `[ ] PENDENTE`

- [ ] tabela do histórico;
- [ ] abrir plano;
- [ ] reabrir plano salvo;
- [ ] cancelar;
- [ ] PDF;
- [ ] detalhes;
- [ ] refresh/reopen sem simulação silenciosa;
- [ ] compatibilidade legada;
- [ ] revisão manual preservada.

---

### Missão REF-061 — Reduzir `PlanningPage.js` a orquestradora

**Status:** `[ ] PENDENTE`

#### Critérios de aceite

A página final deve principalmente:

- criar o container;
- inicializar estado;
- inicializar features;
- montar abas;
- coordenar lifecycle;
- encaminhar eventos de alto nível;
- destruir listeners/recursos.

Ela não deve conter:

- cálculo produtivo;
- construção completa de grafos;
- modais extensos;
- adapters complexos;
- lógica detalhada de movimento;
- regras de estoque;
- implementação do renderer.

#### Métrica orientativa

Não existe meta rígida de linhas. Como referência, espera-se redução substancial, preferencialmente para uma faixa em que a responsabilidade da página seja legível. A qualidade da fronteira vale mais que atingir um número artificial.

---

## FASE 7 — CSS e apresentação sem redesign amplo

**Objetivo:** remover CSS morto do V2 e organizar somente o necessário.

### Missão REF-070 — Remover CSS do V2 e modularizar CSS do planejamento

**Status:** `[ ] PENDENTE`

- [ ] remover `production-calendar.css` quando não houver consumidor;
- [ ] garantir que Gantt usa CSS próprio;
- [ ] extrair do `style.css` apenas blocos claramente pertencentes ao planejamento;
- [ ] não alterar aparência sem necessidade;
- [ ] preservar responsividade atual;
- [ ] eliminar seletores mortos comprovados;
- [ ] não introduzir Tailwind nesta fase.

#### Estrutura sugerida

```text
styles/
├── planning-page.css
├── planning-flow.css
├── planning-stock.css
├── planning-modals.css
└── planning-history.css
```

A estrutura final depende da auditoria de CSS.

---

## FASE 8 — Auditoria e possível divisão de outros arquivos

**Objetivo:** decidir com evidência, não por ansiedade com tamanho.

### Missão REF-080 — Aplicar decisões da auditoria de arquivos grandes

**Status:** `[ ] PENDENTE`

#### Regra

Cada divisão adicional precisa de missão própria e não pode acontecer em paralelo com a PlanningPage.

#### Prioridade provável

1. [ ] `ganttAps.renderer.js`, se lifecycle, toolbar, inspector e rendering estiverem excessivamente misturados;
2. [ ] `AnalysisPage.js`, se houver novas alterações frequentes e baixa coesão;
3. [ ] `ImportHistoryPage.js`, se houver responsabilidades independentes;
4. [ ] `planning.routes.js`, somente com testes de rota/persistência;
5. [ ] `planning.service.js`, somente em projeto específico do motor;
6. [ ] `planningReoptimization.service.js`, somente com skill e testes de reotimização;
7. [ ] `style.css`, por módulos visuais, não por reescrita.

### Critério de não ação

Se um arquivo grande for coeso e estável, registrar “não dividir agora” é uma decisão válida.

---

## FASE 9 — Regressão técnica e homologação operacional

### Missão REF-090 — Regressão técnica completa

**Status:** `[ ] PENDENTE`

#### Comandos mínimos

```bash
node --check pages/planning/PlanningPage.js
node --test tests/*.js
git diff --check
```

A lista final de `node --check` deve incluir todos os arquivos alterados.

#### Cenários obrigatórios

- [ ] simular;
- [ ] editar produção;
- [ ] usar/ignorar estoque;
- [ ] renderizar fluxo;
- [ ] renderizar Gantt;
- [ ] focar allocation;
- [ ] mover;
- [ ] rejeitar movimento;
- [ ] dividir;
- [ ] editar máquina/pessoas;
- [ ] transportar;
- [ ] undo/redo;
- [ ] descartar;
- [ ] reotimizar;
- [ ] salvar;
- [ ] refresh;
- [ ] reabrir;
- [ ] abrir plano antigo;
- [ ] projetar estoque;
- [ ] verificar conflito de revisão;
- [ ] verificar permissões.

#### Resultado

Todos os testes devem estar verdes ou cada exceção deve ser explicitamente aprovada pelo Gu, com risco e plano de correção.

---

### Missão REF-091 — Homologação operacional com Gu

**Status:** `[ ] PENDENTE`

#### Roteiro mínimo

1. abrir Simulação;
2. criar múltiplas produções;
3. gerar fluxo;
4. gerar Gantt;
5. verificar cores e separação;
6. mover uma allocation válida;
7. tentar uma inválida;
8. dividir uma allocation;
9. editar máquina/pessoas;
10. configurar dia/equipe quando aplicável;
11. usar transporte;
12. abrir estoque de uma data;
13. desfazer/refazer;
14. salvar;
15. atualizar navegador;
16. reabrir plano;
17. confirmar que nada foi recalculado silenciosamente;
18. validar histórico;
19. validar fullscreen/zoom;
20. validar uso mínimo em tela móvel.

#### Veredito permitido

- `HOMOLOGADO`;
- `HOMOLOGADO COM RESTRIÇÕES`;
- `REPROVADO`.

Somente o Gu ou homologador independente pode dar o veredito operacional final.

---

## FASE 10 — Encerramento da reestruturação V1

### Missão REF-100 — Limpeza e documentação final

**Status:** `[ ] PENDENTE`

- [ ] atualizar `AGENTS.md` para Gantt-only;
- [ ] atualizar arquitetura normativa;
- [ ] atualizar árvore de fontes canônicas;
- [ ] arquivar documentos do V2 como históricos;
- [ ] remover código morto comprovado;
- [ ] registrar estrutura final;
- [ ] registrar testes finais;
- [ ] registrar riscos residuais;
- [ ] registrar itens adiados para V2/Line;
- [ ] criar checkpoint aprovado pelo Gu;
- [ ] marcar status geral deste documento.

#### Critérios finais

- [ ] Gantt APS é o único calendário ativo.
- [ ] `PlanningPage.js` é orquestradora.
- [ ] nenhum comportamento produtivo mudou sem requisito.
- [ ] planejamentos antigos continuam abrindo.
- [ ] save/reopen continua preservando o draft.
- [ ] suíte técnica estável.
- [ ] homologação concluída.
- [ ] nenhuma credencial exposta.

---

# 8. Critérios de qualidade para a divisão dos arquivos

Cada novo módulo deve atender aos itens aplicáveis:

- [ ] nome descreve responsabilidade;
- [ ] export público pequeno;
- [ ] dependências explícitas;
- [ ] sem acesso a global quando evitável;
- [ ] sem regra produtiva duplicada;
- [ ] sem mutação escondida de input;
- [ ] sem circularidade;
- [ ] teste focado;
- [ ] tratamento de lifecycle quando possui listeners;
- [ ] compatibilidade temporária documentada;
- [ ] comentários explicam motivo, não repetem o código;
- [ ] UTF-8 preservado;
- [ ] nenhuma correção de encoding fora do escopo;
- [ ] nenhuma abstração genérica sem consumidor real.

### Sinais de divisão ruim

- arquivo novo com centenas de parâmetros;
- objeto `context` com quase todo o estado da aplicação;
- imports circulares;
- módulo chamado `utils.js` com funções de vários domínios;
- UI chamando diretamente SQL/route interna;
- service importando DOM;
- Gantt importando regra produtiva;
- função movida, mas ainda dependente de variáveis globais implícitas;
- re-export permanente mantendo dois nomes para sempre;
- testes que só procuram regex em código-fonte quando seria possível testar comportamento.

---

# 9. Matriz de invariantes a proteger

| Domínio | Invariante | Teste/evidência necessária |
|---|---|---|
| Draft manual | Após criado, é fonte de verdade do calendário editado. | Save/load, refresh/reopen e transação. |
| Movimento | Não chama simulação/scheduler automático. | Teste de integração do comando. |
| Rollback | Candidato rejeitado não substitui o aceito. | Teste transacional. |
| Identidade | `allocationId` é estável e persistente. | Split, move, save/reopen. |
| Quantidade | Split conserva total e resíduo determinístico. | Testes de precisão e recursão. |
| Estoque | Ledger e projeção seguem fontes canônicas. | Cenários parcial, zero e produção disponível. |
| Precedência | Componente não é consumido antes de disponível. | Teste de dependência. |
| Capacidade | Respeita turnos, pessoas, dias úteis e matriz. | Recurso por data e overrides. |
| Reotimização | Passado congelado; futuro limitado ao cutoff. | Testes de cutoff/delta. |
| Persistência | Draft manual não sobrescreve snapshot automático. | Save/reopen e payload. |
| Concorrência | `manual_schedule_revision` impede sobrescrita silenciosa. | Teste 409/revision. |
| Legado | Planejamentos antigos são normalizados sem conversão destrutiva. | Fixtures legadas. |
| UI | Gantt apresenta e emite intenção; não calcula domínio. | Auditoria de imports e callbacks. |
| Renderer | Falha é visível; não há fallback V2. | Lifecycle/error state. |
| Segurança | `.env` e credenciais não entram em pacote/commit. | Revisão Git e pacote. |

---

# 10. Estratégia de testes por tipo de mudança

### Movimento de função pura

- teste unitário do módulo novo;
- comparação com comportamento antigo;
- `node --check`;
- `git diff --check`.

### Movimento de UI/DOM

- teste do callback/evento;
- teste de lifecycle;
- roteiro manual curto;
- homologação visual quando houver diferença aparente.

### Movimento de adapter/snapshot

- deep equality ou comparação dos campos canônicos;
- IDs, datas, horários, quantidades, memberships e cores;
- não mutação do input.

### Mudança de schedule/manual

- draft;
- transação;
- validação;
- estoque;
- persistência;
- integração na PlanningPage/Gantt.

### Remoção de arquivo legado

- busca de imports;
- suíte completa;
- smoke de página;
- busca por nomes legados;
- verificação de CSS morto;
- homologação operacional.

---

# 11. Modelo de prompt para qualquer missão do Codex

Copiar e adaptar somente os campos entre colchetes.

```text
Leia primeiro, nesta ordem:
1. AGENTS.md
2. PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md
3. As skills do domínio exigidas pela missão
4. Os documentos/arquivos canônicos citados na missão

Execute somente a missão [ID E NOME DA MISSÃO].

Objetivo único:
[OBJETIVO]

Regras obrigatórias:
- preserve todas as alterações existentes do usuário;
- não faça commit nem push;
- não use comandos destrutivos de Git;
- não amplie escopo;
- não misture refatoração com mudança de regra produtiva;
- não altere banco/migrations;
- não altere payload persistido nem IDs;
- antes de editar, apresente o preflight exigido pelo plano;
- execute testes focados e registre comandos/resultados;
- atualize somente os checkboxes realmente concluídos e adicione o registro da execução no log do plano;
- se encontrar bloqueio arquitetural ou regra divergente, pare e registre evidências.

Arquivos prováveis:
[ARQUIVOS]

Invariantes prioritárias:
[INVARIANTES]

Testes mínimos:
[TESTES]

Fora de escopo:
[FORA DE ESCOPO]

Ao final, entregue exatamente as seções exigidas no plano.
```

---

# 12. Primeiro prompt recomendado para o Codex

Este é o primeiro trabalho a ser executado. Ele é **read-only** e não deve alterar código funcional.

```text
Leia primeiro, nesta ordem:
1. AGENTS.md
2. PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md
3. $acofer-investigation
4. docs/APS_GANTT_ARCHITECTURE.md
5. docs/APS_GANTT_TASKS.md
6. docs/APS_GANTT_EVOLUTION_LOG.md

Execute somente as missões REF-000, REF-001, REF-002 e REF-003 em modo de auditoria, sem alterar código produtivo.

Objetivos:
- registrar baseline seguro da árvore de trabalho atual;
- mapear responsabilidades, estado e dependências de pages/PlanningPage.js;
- classificar todo o acoplamento entre Calendário V2, PlanningPage e Gantt APS;
- auditar os demais arquivos grandes e recomendar se devem ou não ser divididos.

Regras:
- preserve todas as alterações existentes;
- não faça commit, push, reset, clean ou checkout destrutivo;
- não corrija testes ainda;
- não mova arquivos;
- não renomeie símbolos;
- não remova V2;
- não altere banco/migrations;
- atualize no plano apenas os itens de auditoria efetivamente concluídos;
- crie, se necessário, documentos de evidência em docs/refactor/, mas não altere comportamento.

Entregue:
- status do Git e baseline;
- mapa por faixa de linhas e funções da PlanningPage;
- inventário de estado mutável;
- grafo textual de dependências;
- tabela símbolo atual → categoria → consumidores → destino proposto;
- auditoria dos arquivos grandes;
- ordem recomendada das primeiras missões de implementação;
- riscos bloqueantes;
- registro no log do plano.
```

---

# 13. Registro de execução

O Codex deve acrescentar novas entradas no topo desta seção, sem apagar entradas anteriores.

## Modelo

```text
### AAAA-MM-DD HH:MM — [MISSÃO]

Status: CONCLUÍDA | PARCIAL | BLOQUEADA | REPROVADA
Executor/agent:
Skills usadas:
Branch/commit de referência:
Objetivo:
Arquivos lidos:
Arquivos alterados:
Resumo do diff:
Testes/comandos:
Resultado:
Homologação:
Checkboxes atualizados:
Riscos/pendências:
Próxima missão sugerida:
```

## Entradas

### 2026-08-10 - REF-035 - Extrair controlador de persistencia manual

Status: CONCLUIDA
Executor/agent: Codex em missao de extracao pequena e delimitada, com auditoria read-only paralela de Rogerio Ceni e design de testes por Toto Wolff
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-persistence-legacy`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `815c74c`
Objetivo: auditar o bloco real de save/load do planejamento manual e extrair somente a orquestracao segura para `shared/planning-controller/planningPersistenceController.js`, preservando DOM, `localStorage`, historico, backend, payload, revision e hash.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md`, `docs/refactor/REF-034_PLANNING_TRANSPORT_CONTROLLER_EXTRACTION.md`, `pages/PlanningPage.js`, `services/manualSchedulePersistence.service.js`, `server/routes/planning.routes.js`, `tests/manualSchedulePersistence.service.test.js`, `tests/planningManualScheduleSaveLoad.integration.test.js`, `tests/planningTransportController.test.js` e `package.json`.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-controller/planningPersistenceController.js`, `tests/planningPersistenceController.test.js`, `tests/automaticSimulationBaseline.service.test.js`, `docs/refactor/REF-035_PLANNING_PERSISTENCE_CONTROLLER_EXTRACTION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: criado controlador de persistencia manual com montagem de payload create/update, save por callbacks explicitos e montagem de estado de reopen a partir do draft persistido normalizado; `PlanningPage.js` manteve API concreta, storage, modal, botao/loading, historico, toast, navegacao, render e criacao de baseline automatica.
Testes/comandos: baseline inicial com `git status --short`, branch, `git rev-parse --short HEAD`, contagem canonica e `node --test tests/*.js`; validacao focada com `node --check shared/planning-controller/planningPersistenceController.js`, `node --check pages/PlanningPage.js`, `node --check tests/planningPersistenceController.test.js`, `node --test tests/planningPersistenceController.test.js`; relacionados `manualSchedulePersistence`, `planningManualScheduleSaveLoad` e `automaticSimulationBaseline`.
Resultado: baseline inicial 85/85; auditoria confirmou fronteira segura parcial; `PlanningPage.js` passou de 6265 para 6212 linhas; testes focados e relacionados aprovados; suite final 86/86.
Homologacao: nao marcada; mudanca estrutural sem UI nova. REF-013 manual permanece pendente.
Checkboxes atualizados: REF-035 registrada como concluida no quadro de extracoes; pendencias de REF-013, Calendario V2, identidade manual, move/split, stock-only, `productiveMinutes`, `generatePlanningCode`, turnos/capacidade e persistencia ampla/autosave/descarte mantidas abertas.
Riscos/pendencias: descarte total, autosave local, pre-validacao produtiva, efeitos visuais pos-save e baseline automatica de reopen seguem na pagina; controller depende dos services canonicos e API real por callbacks; homologacao operacional em navegador nao foi executada.
Proxima missao sugerida: auditar e, se seguro, extrair somente o controlador de descarte/autosave local da persistencia manual, mantendo save/load ja extraidos, backend, services, movimento, split, estoque, transporte, Gantt e Calendario V2 fora do escopo.

---

### 2026-08-10 - REF-034 - Extrair controlador de transporte manual

Status: CONCLUIDA
Executor/agent: Codex em missao de extracao pequena e delimitada, com auditoria read-only paralela de Rogerio Ceni e design de testes por Toto Wolff
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-validation-diagnostics`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `6c9acab`
Objetivo: auditar o bloco real de transporte no planejamento manual e extrair somente a orquestracao segura para `shared/planning-controller/planningTransportController.js`, preservando DOM, estado visual, services e persistencia fora do modulo.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md`, `docs/refactor/REF-033_PLANNING_STOCK_PROJECTION_CONTROLLER_EXTRACTION.md`, `pages/PlanningPage.js`, `services/manualScheduleValidation.service.js`, `services/manualScheduleTransaction.service.js`, `services/manualSchedulePersistence.service.js`, `services/planningReoptimization.service.js`, testes de transporte/validacao/reotimizacao/persistencia e `package.json`.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-controller/planningTransportController.js`, `tests/planningTransportController.test.js`, `tests/planningReoptimization.service.test.js`, `tests/productionCalendarMemberships.test.js`, `docs/refactor/REF-034_PLANNING_TRANSPORT_CONTROLLER_EXTRACTION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: criado controlador de transporte manual com identidade, lookup, escopo downstream, calculo de datas/horas, montagem de constraints e save por callbacks explicitos; `PlanningPage.js` manteve wrappers, modal, DOM, loading, toast, aceite de estado e integracao com services; testes estaticos foram redirecionados para o novo modulo.
Testes/comandos: baseline inicial com `git status --short`, branch, `git rev-parse HEAD`, contagem canonica e `node --test tests/*.js`; validacao focada com `node --check shared/planning-controller/planningTransportController.js`, `node --check pages/PlanningPage.js`, `node --test tests/planningTransportController.test.js`; relacionados `productionCalendarMemberships`, `planningReoptimization`, `manualScheduleValidation`, `manualSchedulePersistence` e `planningManualScheduleSaveLoad`.
Resultado: baseline inicial 84/84; auditoria confirmou fronteira segura com callbacks explicitos; `PlanningPage.js` passou de 6610 para 6265 linhas; testes focados e relacionados aprovados; suite final 85/85; `git diff --check` OK com avisos LF/CRLF.
Homologacao: nao marcada; mudanca estrutural sem UI nova. REF-013 manual permanece pendente.
Checkboxes atualizados: REF-034 registrada como concluida no quadro de extracoes; pendencias de REF-013, Calendario V2, identidade manual, move/split, persistencia, stock-only, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade mantidas abertas.
Riscos/pendencias: modal de transporte segue na pagina; controller coordena callbacks fakes nos testes e depende dos services reais via pagina; transporte automatico de simulacao nao foi extraido; homologacao operacional em navegador nao foi executada.
Proxima missao sugerida: auditar e, se seguro, extrair somente um controlador de selecao/estado visual do calendario manual, mantendo movimento, split, transporte, estoque, persistencia, Gantt e Calendario V2 fora do escopo.

---

### 2026-08-10 - REF-033 - Extrair controlador read-only de projecao de estoque

Status: CONCLUIDA
Executor/agent: Codex em missao de extracao pequena e delimitada
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-stock`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `14fa4a3`
Objetivo: auditar e extrair somente a orquestracao read-only de projecao de estoque, separando modelo/projecao de DOM, movimento, decisao e mutacao de estoque.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md`, `docs/refactor/REF-032_PLANNING_HISTORY_CONTROLLER_EXTRACTION.md`, `pages/PlanningPage.js`, `services/planningStockProjection.service.js`, `services/materialStockMetrics.service.js`, `tests/planningStockProjection.service.test.js`, `tests/planningStockProjectionModal.test.js` e `tests/materialStockMetrics.service.test.js`.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-controller/planningStockProjectionController.js`, `tests/planningStockProjectionController.test.js`, `docs/refactor/REF-033_PLANNING_STOCK_PROJECTION_CONTROLLER_EXTRACTION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: criado modulo `planningStockProjectionController` sobre `projectPlanningStockByDay`; `PlanningPage.js` deixou de importar diretamente o service de projecao, passou a delegar montagem de entrada/modelo/alerta ao controlador e manteve DOM/modal, DataTable, foco, toast e leitura de `localStorage` na pagina.
Testes/comandos: baseline inicial com `git status --short`, branch, `git rev-parse HEAD`, contagem canonica e `node --test tests/*.js`; validacao focada com `node --check shared/planning-controller/planningStockProjectionController.js`, `node --check pages/PlanningPage.js`, `node --test tests/planningStockProjectionController.test.js`, `node --test tests/planningStockProjection.service.test.js`, `node --test tests/planningStockProjectionModal.test.js`, `node --test tests/materialStockMetrics.service.test.js`; suite final `node --test tests/*.js`; `git diff --check`.
Resultado: baseline inicial 83/83; auditoria confirmou fronteira segura read-only; `PlanningPage.js` passou de 6699 para 6610 linhas pelo metodo canonico; suite final 84/84; `git diff --check` OK com avisos LF/CRLF.
Homologacao: nao marcada; mudanca estrutural sem UI nova e sem alteracao de regra produtiva. REF-013 manual permanece pendente.
Checkboxes atualizados: REF-033 registrada como concluida no quadro de extracoes; nenhuma missao futura foi marcada como concluida.
Riscos/pendencias: REF-013 homologacao manual, stock-only/movimento de estoque, Calendario V2, identidade do calendario manual, manual move/split, transporte, persistencia, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade seguem pendentes.
Proxima missao sugerida: auditar e, se seguro, extrair somente um controlador read-only de selecao/estado visual do calendario manual, mantendo movimento, split, transporte, estoque, persistencia e Gantt fora do escopo.

---

### 2026-08-10 - REF-032 - Extrair controlador de historico manual

Status: CONCLUIDA
Executor/agent: Codex em missao de extracao pequena e delimitada
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-manual-calendar`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `85e6ff8`
Objetivo: auditar e extrair somente a orquestracao neutra do historico manual, preservando snapshots, IDs, redo invalidado, restauracao e disponibilidade de undo/redo.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md`, `docs/refactor/REF-031_PLANNING_FLOW_EVENTS_EXTRACTION.md`, `pages/PlanningPage.js`, `services/manualScheduleHistory.service.js`, `tests/manualScheduleHistory.service.test.js` e `package.json`.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-controller/planningHistoryController.js`, `tests/planningHistoryController.test.js`, `tests/manualScheduleHistory.service.test.js`, `docs/refactor/REF-032_PLANNING_HISTORY_CONTROLLER_EXTRACTION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: criado modulo `planningHistoryController` sobre o service canonico; `PlanningPage.js` deixou de importar o service diretamente e passou a usar controlador com `captureSnapshot`, `restoreSnapshot`, `onBeforeRestore` e `onAfterRestore`; DOM do Flow e mutacao do draft permaneceram na pagina.
Testes/comandos: baseline inicial com `git status --short`, branch, `git rev-parse HEAD`, contagem canonica e `node --test tests/*.js`; validacao focada com `node --check shared/planning-controller/planningHistoryController.js`, `node --check pages/PlanningPage.js`, `node --test tests/planningHistoryController.test.js` e `node --test tests/manualScheduleHistory.service.test.js`; suite final `node --test tests/*.js`; `git diff --check`.
Resultado: baseline inicial 82/82; auditoria confirmou fronteira segura por callbacks; `PlanningPage.js` passou de 6707 para 6699 linhas pelo metodo canonico; suite final 83/83; `git diff --check` OK com avisos LF/CRLF.
Homologacao: nao marcada; mudanca estrutural sem UI nova. REF-013 manual permanece pendente.
Checkboxes atualizados: REF-032 registrada como concluida no quadro de extracoes; nenhuma missao futura foi marcada como concluida.
Riscos/pendencias: REF-013 homologacao manual, modal/foco do Flow, Calendario V2, identidade do calendario manual, manual move/split, transporte, estoque, persistencia, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade seguem pendentes.
Proxima missao sugerida: auditar e, se seguro, extrair somente os handlers neutros de selecao/restauracao visual do calendario manual, mantendo movimento, split, transporte, estoque, persistencia e Gantt fora do escopo.

---

### 2026-08-10 - REF-031 - Extrair eventos click/keyboard do Flow

Status: CONCLUIDA
Executor/agent: Codex em missao de extracao pequena e delimitada
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-production-calendar-ui`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `f29c4fb`
Objetivo: auditar e extrair somente a identificacao e o encaminhamento de eventos click/keyboard dos nos do Flow, mantendo modal, detalhe e foco na `PlanningPage.js`.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-028_PLANNING_FLOW_MODEL_EXTRACTION.md`, `docs/refactor/REF-029_PLANNING_FLOW_VIEW_EXTRACTION.md`, `docs/refactor/REF-030_PLANNING_FLOW_DOM_EXTRACTION.md`, `pages/PlanningPage.js`, `shared/planning-presentation/planningFlowView.js`, `shared/planning-presentation/planningFlowDom.js` e testes relacionados a Flow.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-presentation/planningFlowEvents.js`, `tests/planningFlowEvents.test.js`, `docs/refactor/REF-031_PLANNING_FLOW_EVENTS_EXTRACTION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: criado modulo `planningFlowEvents` com `bindPlanningFlowEvents` e `extractPlanningFlowNodeData`; `PlanningPage.js` substituiu dois listeners inline por callback unico que preserva `openFlowNodeDetailsModal(flowNode)` antes de `focusFlowNodeInSchedule(flowNode)`.
Testes/comandos: baseline inicial com `git status --short`, branch, `git rev-parse HEAD`, contagem canonica e `node --test tests/*.js`; validacao focada com `node --check shared/planning-presentation/planningFlowEvents.js`, `node --check pages/PlanningPage.js` e `node --test tests/planningFlowEvents.test.js`; suite final `node --test tests/*.js`; `git diff --check`.
Resultado: baseline inicial 73/73; auditoria confirmou separacao segura por callback; `PlanningPage.js` passou de 6713 para 6707 linhas pelo metodo canonico; suite final 82/82; `git diff --check` OK com avisos LF/CRLF.
Homologacao: nao marcada; mudanca estrutural sem UI nova. REF-013 manual permanece pendente.
Checkboxes atualizados: REF-031 registrada como concluida no quadro de extracoes; nenhuma missao futura foi marcada como concluida.
Riscos/pendencias: REF-013 homologacao manual, modal/detalhes do Flow, resolucao de allocation, foco Flow -> Gantt, Calendario V2, identidade do calendario manual, manual move/split, persistencia, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade seguem pendentes.
Proxima missao sugerida: auditar e, se seguro, extrair somente o modal/detalhes do Flow como apresentacao acionada por callback, mantendo `renderPlanFlowDetail`, resolucao de allocation e foco Flow -> Gantt na pagina.

---

### 2026-08-07 20:10 - REF-030 - Extrair DOM/SVG do Flow ja renderizado

Status: CONCLUIDA
Executor/agent: Codex em missao de extracao pequena e delimitada
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `0cb5a18`
Objetivo: auditar e extrair somente a camada que monta/atualiza o DOM/SVG do Flow ja renderizado, sem mover eventos, modal, foco Gantt ou regras produtivas.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-028_PLANNING_FLOW_MODEL_EXTRACTION.md`, `docs/refactor/REF-029_PLANNING_FLOW_VIEW_EXTRACTION.md`, `pages/PlanningPage.js`, `shared/planning-domain/planningFlowModel.js`, `shared/planning-presentation/planningFlowView.js` e testes relacionados a Flow/tema.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-presentation/planningFlowDom.js`, `tests/planningFlowDom.test.js`, `tests/productionDisplayColor.test.js`, `docs/refactor/REF-030_PLANNING_FLOW_DOM_EXTRACTION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: criado modulo `planningFlowDom` com `drawProductionFlowConnectors`, `scheduleProductionFlowConnectors` e `renderProductionFlowDom`; `PlanningPage.js` passou a injetar `page`, `requestAnimationFrame` e `productionTheme`; `renderProductionFlows`, eventos, modal e foco Flow -> Gantt permaneceram na pagina.
Testes/comandos: baseline inicial com `git status --short`, `git rev-parse HEAD`, contagem canonica e `node --test tests/*.js`; validacao focada com `node --check shared/planning-presentation/planningFlowDom.js`, `node --check pages/PlanningPage.js`, `node --test tests/planningFlowDom.test.js`, `node --test tests/productionDisplayColor.test.js`; suite final `node --test tests/*.js`; `git diff --check`.
Resultado: baseline inicial 68/68; `PlanningPage.js` passou de 6756 para 6713 linhas pelo metodo canonico; suite final 73/73; `git diff --check` OK com avisos LF/CRLF.
Homologacao: nao marcada; mudanca estrutural sem UI nova. REF-013 manual permanece pendente.
Checkboxes atualizados: REF-030 registrada como concluida no quadro de extracoes; nenhuma missao futura foi marcada como concluida.
Riscos/pendencias: REF-013 homologacao manual, eventos e modal do Flow, foco Flow -> Gantt, Calendario V2, identidade do calendario manual, manual move/split, persistencia, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade seguem pendentes.
Proxima missao sugerida: auditar e, se seguro, extrair somente os eventos click/keyboard do Flow para um controlador visual, mantendo `renderPlanFlowDetail`, modal e foco Flow -> Gantt como fronteiras explicitas.

---

### 2026-08-07 19:35 - REF-029 - Extrair apresentacao HTML pura do Flow

Status: CONCLUIDA
Executor/agent: Codex em missao de extracao pequena e delimitada
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `3d8f8ce`
Objetivo: auditar e extrair somente funcoes do Flow cuja responsabilidade seja transformar dados ja derivados em HTML/string de apresentacao.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-028_PLANNING_FLOW_MODEL_EXTRACTION.md`, `pages/PlanningPage.js`, `shared/planning-domain/planningFlowModel.js`, `package.json` e testes relacionados a Flow/tema.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-presentation/planningFlowView.js`, `tests/planningFlowView.test.js`, `tests/productionDisplayColor.test.js`, `docs/refactor/REF-029_PLANNING_FLOW_VIEW_EXTRACTION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: criado modulo `planningFlowView` com `renderFlowNodeCard`, implementacao HTML de `renderFlowGraph`, `renderFlowTree` e helpers privados de apresentacao; `PlanningPage.js` passou a injetar dependencias via adapter local e manteve DOM/eventos/foco/legenda; teste novo caracteriza o HTML real e teste estatico de cor foi realinhado ao novo local do card.
Testes/comandos: baseline inicial `git status --short`, branch, `git rev-parse HEAD`, contagem canonica e `node --test tests/*.js`; validacao focada com `node --check shared/planning-presentation/planningFlowView.js`, `node --check pages/PlanningPage.js`, `node --test tests/planningFlowView.test.js`, `node --test tests/productionDisplayColor.test.js`; suite final `node --test tests/*.js`; `git diff --check`.
Resultado: baseline inicial 64/64; `PlanningPage.js` passou de 6832 para 6756 linhas pelo metodo canonico; suite final registrada no documento REF-029.
Homologacao: nao marcada; mudanca estrutural sem UI nova. REF-013 manual permanece pendente.
Checkboxes atualizados: REF-029 registrada como concluida no quadro de extracoes; nenhuma missao futura foi marcada como concluida.
Riscos/pendencias: eventos/DOM/SVG do Flow, foco Flow -> Gantt, Calendario V2, manual move/split, persistencia, identidade do calendario manual, `productiveMinutes`, `generatePlanningCode`, turnos/capacidade e homologacao manual REF-013 seguem pendentes.
Proxima missao sugerida: auditar e, se seguro, extrair apenas os conectores/eventos DOM do Flow para modulo controlador visual, mantendo foco Flow -> Gantt como fronteira explicita.

---

### 2026-08-07 18:50 - REF-028 - Auditar e extrair modelo de leitura do fluxo produtivo

Status: CONCLUIDA
Executor/agent: Codex em missao de extracao pequena e delimitada
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `f38b266`
Objetivo: auditar o bloco de derivacao do modelo de dados do fluxo produtivo e extrair somente funcoes puras de arvores, nos, chaves, quantidades, arestas e metadados.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-001_PLANNING_PAGE_MAP.md`, `docs/refactor/REF-025_PLANNING_LOOKUPS_EXTRACTION.md`, `docs/refactor/REF-026_PLANNING_SCHEDULE_SNAPSHOT_EXTRACTION.md`, `docs/refactor/REF-027_PLANNING_PAYLOAD_BUILDER_EXTRACTION.md`, `pages/PlanningPage.js` e `package.json`.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-domain/planningFlowModel.js`, `tests/planningFlowModel.test.js`, `docs/refactor/REF-028_PLANNING_FLOW_MODEL_EXTRACTION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: criado modulo neutro `planningFlowModel`; a pagina passou a delegar selecao de raizes, resolucao de modelo/chave, normalizacao de quantidades e construcao de grafo para dependencias explicitas, mantendo wrappers para a camada visual.
Testes/comandos: baseline inicial `git status --short`, `git rev-parse HEAD`, branch, contagem canonica e `node --test tests/*.js`; validacao focada com `node --check shared/planning-domain/planningFlowModel.js`, `node --check pages/PlanningPage.js` e `node --test tests/planningFlowModel.test.js`; suite final `node --test tests/*.js`; `git diff --check`.
Resultado: baseline inicial 57/57; teste focado novo aprovado com 7/7 subtestes; suite final 64/64; `git diff --check` OK, com avisos conhecidos de LF -> CRLF; `PlanningPage.js` passou de 6990 para 6832 linhas pelo metodo canonico.
Homologacao: nao aplicavel como homologacao operacional; mudanca estrutural sem UI nova.
Checkboxes atualizados: REF-028 registrada como concluida no quadro de extracoes; nenhuma missao futura foi marcada como concluida.
Riscos/pendencias: camada visual do Flow, modal, DOM/SVG, foco Fluxo -> Gantt, estoque/toggle, Calendario V2, identidade do calendario manual, manual move/split, persistencia, `generatePlanningCode`, `productiveMinutes`, turnos/capacidade e homologacao manual REF-013 seguem pendentes.
Proxima missao sugerida: extrair a camada visual HTML do Flow para modulo proprio, mantendo DOM/eventos/foco na pagina ate nova auditoria.

---

### 2026-08-07 18:05 — REF-027 — Extrair construcao pura de payloads da PlanningPage

Status: CONCLUIDA
Executor/agent: Codex em missao de extracao pequena e delimitada
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `804669b`
Objetivo: auditar e extrair somente a construcao pura de payloads/objetos de dados, separando explicitamente de save/API/persistencia.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-001_PLANNING_PAGE_MAP.md`, `docs/refactor/REF-025_PLANNING_LOOKUPS_EXTRACTION.md`, `docs/refactor/REF-026_PLANNING_SCHEDULE_SNAPSHOT_EXTRACTION.md`, `pages/PlanningPage.js` e `package.json`.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-domain/planningPayloadBuilder.js`, `tests/planningPayloadBuilder.test.js`, `docs/refactor/REF-027_PLANNING_PAYLOAD_BUILDER_EXTRACTION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: criado modulo neutro `planningPayloadBuilder`; a pagina passou a delegar a montagem pura de producoes, shifts, stock-only filtrado, payload completo e payload normalizado, mantendo wrappers para closure, defaults produtivos e orquestracao.
Testes/comandos: baseline inicial `git status --short`, `git rev-parse HEAD`, `node --test tests/*.js`, branch e contagem canonica; validacao focada com `node --check shared/planning-domain/planningPayloadBuilder.js`, `node --check pages/PlanningPage.js` e `node --test tests/planningPayloadBuilder.test.js`; suite final `node --test tests/*.js`; `git diff --check`.
Resultado: baseline inicial 56/56; teste focado novo aprovado; suite final 57/57; `PlanningPage.js` passou de 7016 para 6990 linhas pelo metodo canonico.
Homologacao: nao aplicavel como homologacao operacional; mudanca estrutural sem UI nova.
Checkboxes atualizados: REF-027 registrada como concluida no quadro de extracoes; nenhuma missao futura foi marcada como concluida.
Riscos/pendencias: `productionPayload` e `payload` seguem na pagina como wrappers por leitura de closure e defaults; `hydrateProductionDefaults`, save/API/persistencia, revision/hash, manual move, split/editor, transporte, estoque, solver, reotimizacao, Gantt, Calendario V2, `generatePlanningCode`, `productiveMinutes`, turnos/capacidade e homologacao manual REF-013 seguem pendentes.
Proxima missao sugerida: auditar e, se seguro, extrair normalizadores de identidade do calendario manual (`productionCalendarParentOperationId` e helpers imediatos) para modulo proprio, sem mover movimento manual.

---

### 2026-08-07 17:10 — REF-026 — Extrair bloco coeso de snapshot/leitura do planejamento

Status: CONCLUIDA
Executor/agent: Codex em missao de extracao pequena e delimitada
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `5923c5e`
Objetivo: auditar e extrair somente a fronteira limpa de snapshot/leitura do planejamento, sem mover regras de movimento, split, estoque, transporte, reotimizacao, persistencia, Gantt ou Calendario V2.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-001_PLANNING_PAGE_MAP.md`, `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md`, `docs/refactor/REF-025_PLANNING_LOOKUPS_EXTRACTION.md`, `pages/PlanningPage.js`, `package.json` e testes relacionados a integracao manual, lookups e view model.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-domain/planningScheduleSnapshot.js`, `tests/planningScheduleSnapshot.test.js`, `docs/refactor/REF-026_PLANNING_SCHEDULE_SNAPSHOT_EXTRACTION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: criado modulo neutro `planningScheduleSnapshot` para helpers de leitura/derivacao; `PlanningPage.js` passou a delegar selecao de timeline, maquinas, planningId, dias com allocations e snapshot de validacao, mantendo wrappers finos para dependencias de closure e compatibilidade.
Testes/comandos: baseline inicial `git status --short`, branch, HEAD, contagem canonica e `node --test tests/*.js`; validacao focada com `node --check shared/planning-domain/planningScheduleSnapshot.js`, `node --check pages/PlanningPage.js` e `node --test tests/planningScheduleSnapshot.test.js`; suite final `node --test tests/*.js`; `git diff --check`.
Resultado: baseline inicial 55/55; teste focado novo aprovado; suite final 56/56; `git diff --check` OK com apenas avisos LF/CRLF conhecidos; `PlanningPage.js` passou de 7099 para 7016 linhas pelo metodo canonico.
Homologacao: nao aplicavel como homologacao operacional; mudanca estrutural sem UI nova.
Checkboxes atualizados: REF-026 registrada como concluida no quadro de extrações; nenhuma missao futura foi marcada como concluida.
Riscos/pendencias: `buildProductionCalendarSnapshot` completo permanece na pagina por acoplamento com estado visual, permissoes, recursos, historico, estoque/alertas, transporte, adapter V2 e log; REF-013 manual, Calendario V2, `generatePlanningCode`, `productiveMinutes`, turnos e controladores manuais seguem pendentes.
Proxima missao sugerida: auditar e, se seguro, extrair normalizadores de identidade de calendario manual (`productionCalendarParentOperationId` e helpers imediatos) para modulo proprio, sem mover movimento manual.

---

### 2026-08-07 16:20 — REF-024 — Centralizar isValidDateOnly no modulo de data civil

Status: CONCLUIDA
Executor/agent: Codex em missao de extracao pequena e delimitada; validacao tecnica por suite automatizada
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `d7a7c204daa386611eed7527fa6d6c05be1113ef`
Objetivo: auditar `isValidDateOnly` local da `PlanningPage.js` e, comprovada neutralidade, move-la para `shared/planning-date/planningCivilDate.js`.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-001_PLANNING_PAGE_MAP.md`, `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md`, `docs/refactor/REF-021_PLANNING_FORMATTERS_EXTRACTION.md`, `docs/refactor/REF-022_PLANNING_TIME_FORMATTERS_EXTRACTION.md`, `docs/refactor/REF-023_PLANNING_CIVIL_DATE_EXTRACTION.md`, `pages/PlanningPage.js`, `shared/planning-date/planningCivilDate.js`, `tests/planningCivilDate.test.js` e `package.json`.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-date/planningCivilDate.js`, `tests/planningCivilDate.test.js`, `docs/refactor/REF-024_IS_VALID_DATE_ONLY_CENTRALIZATION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: `PlanningPage.js` passou a importar `isValidDateOnly` do modulo de data civil; a definicao local foi removida; o modulo passou a exportar a mesma implementacao literal; o teste de data civil caracteriza o comportamento real, inclusive datas impossiveis, datetime ISO completo e tipos nao-string.
Testes/comandos: baseline inicial com `git status --short`, `git rev-parse HEAD`, contagem canonica e `node --test tests/*.js`; validacao final com `node --check shared/planning-date/planningCivilDate.js`, `node --check pages/PlanningPage.js`, `node --test tests/planningCivilDate.test.js`, `node --test tests/*.js`, `git diff --check` e diffs obrigatorios.
Resultado: baseline inicial 54/54; suite final 54 testes, 54 aprovados e 0 falhas; `PlanningPage.js` passou de 7143 para 7137 linhas pelo metodo canonico.
Decisao: extracao aprovada porque o helper e neutro, deterministico para entradas iguais no mesmo timezone, sem efeito colateral e sem dependencia de estado da pagina. Regex, `Date`, local/UTC, slice e aceites/rejeicoes foram preservados.
Riscos/pendencias: duplicacoes homonimas em services, routes, V2/adapter e copia privada em `planningFormatters.js` nao foram consolidadas; `2026-01-01T12:34:56.000Z` permanece aceito por slice dos 10 primeiros caracteres; objetos com `toString()` compativel permanecem aceitos; REF-013 manual, Calendario V2, `productiveMinutes`, turnos e `generatePlanningCode` seguem pendentes.
Proxima missao sugerida: auditar e, se seguro, centralizar a copia privada de `isValidDateOnly` usada por `shared/planning-presentation/planningFormatters.js`, sem tocar em services ou V2.

---

### 2026-08-07 15:36 — REF-023 — Extracao cirurgica de helpers neutros de data civil/calendario

Status: CONCLUIDA
Executor/agent: Codex em missao de extracao pequena e delimitada
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `36508293a6682a884806ba90b5cebe2a2e368f0c`
Objetivo: extrair somente `dateOnlyFromDate`, `parseDateOnly`, `addCalendarMonths` e `isWeekendDate` da `PlanningPage.js`, preservando comportamento civil local, rollover e invalidos, sem dependencia da pagina e sem regra produtiva.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-001_PLANNING_PAGE_MAP.md`, `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md`, `docs/refactor/REF-021_PLANNING_FORMATTERS_EXTRACTION.md`, `docs/refactor/REF-022_PLANNING_TIME_FORMATTERS_EXTRACTION.md`, `pages/PlanningPage.js`, `shared/planning-presentation/planningFormatters.js`, `shared/planning-presentation/planningTimeFormatters.js`, `package.json` e buscas por consumidores.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-date/planningCivilDate.js`, `tests/planningCivilDate.test.js`, `docs/refactor/REF-023_PLANNING_CIVIL_DATE_EXTRACTION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: `PlanningPage.js` passou a importar quatro helpers de `shared/planning-date/planningCivilDate.js`; as definicoes locais foram removidas; novo teste de caracterizacao importa diretamente o modulo extraido; documento de evidencia REF-023 criado.
Testes/comandos: baseline inicial `node --test tests/*.js` passou com 53 testes, 53 aprovados e 0 falhos; `node --check` no novo modulo e na pagina passou; teste focado `planningCivilDate` passou; testes relacionados de formatters/time passaram; suite completa final registrada na evidencia.
Contagem canonica: `PlanningPage.js` passou de 7162 para 7143 linhas pelo metodo Node aprovado; commit-base `3650829` tambem tinha 7162 linhas.
Checkboxes atualizados: REF-023 registrada como concluida no checkpoint de refatoracao; commit-base `3650829`, metodo canonico, funcoes extraidas e pendencias preservadas foram registrados.
Riscos/pendencias: `dateOnlyFromDate` e `parseDateOnly` nao sao puras/deterministicas em sentido estrito para todos os inputs, porque invalidos/vazios caem em `new Date()` e dependem do relogio atual; a extracao segue arquiteturalmente valida por serem helpers neutros, sem efeito colateral externo e sem regra produtiva. Comportamento estranho preservado para invalidos, rollover de datas aparentemente invalidas e `addCalendarMonths` sempre retornando dia 1; `productiveMinutes`, helpers de turno, REF-013 manual e Calendario V2 continuam pendentes.
Proxima missao sugerida: extrair somente `generatePlanningCode`, se auditoria confirmar baixo risco e preservar semantica de `Date` local.

---

### 2026-08-07 15:00 — REF-022 — Extracao cirurgica de helpers puros de duracao e horario

Status: CONCLUIDA
Executor/agent: Codex coordenador; JARVIS implementou escopo cirurgico; Toto validou tecnicamente por teste focado e suite; Max nao executou homologacao manual por nao haver mudanca operacional visivel.
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-testing`.
Branch/commit de referencia: `rebuild-production-calendar` / `c404baf36f4820d263dab899e771870a20846640`; commit-base oficial `c404baf`.
Objetivo: retirar da `PlanningPage.js` somente quatro helpers puros relacionados a duracao e conversao de horario, colocando-os em modulo neutro e testavel sem alterar comportamento.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-001_PLANNING_PAGE_MAP.md`, `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md`, `docs/refactor/REF-021_PLANNING_FORMATTERS_EXTRACTION.md`, `pages/PlanningPage.js`, `shared/planning-presentation/planningFormatters.js`, `tests/planningFormatters.test.js`, `package.json` e buscas por consumidores.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-presentation/planningTimeFormatters.js`, `tests/planningTimeFormatters.test.js`, `docs/refactor/REF-022_PLANNING_TIME_FORMATTERS_EXTRACTION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: `PlanningPage.js` passou a importar quatro helpers de `shared/planning-presentation/planningTimeFormatters.js`; as definicoes locais foram removidas; novo teste de caracterizacao importa diretamente o modulo extraido; documento de evidencia REF-022 criado.
Testes/comandos: antes, `git status --short`, `git rev-parse HEAD`, `git branch --show-current` e `node --test tests/*.js` confirmaram worktree limpo, HEAD `c404baf...` e 52/52; depois, `node --check shared/planning-presentation/planningTimeFormatters.js`, `node --check pages/PlanningPage.js`, `node --test tests/planningTimeFormatters.test.js`, `node --test tests/planningFormatters.test.js` e `node --test tests/*.js`.
Resultado: teste focado passou; suite completa final passou com 53 testes, 53 aprovados e 0 falhos; `PlanningPage.js` foi de 7183 para 7162 linhas; reducao liquida de 21 linhas.
Homologacao: nao marcada; teste verde nao substitui homologacao operacional. REF-013 permanece pendente.
Checkboxes atualizados: REF-022 registrada como concluida no checkpoint de refatoracao; commit-base `c404baf`, funcoes extraidas e resultado da suite registrados; proxima extracao recomendada registrada sem execucao.
Riscos/pendencias: `minutesToTime(undefined)` preserva `NaN:NaN`; `timeToMinutes` aceita horas acima de 23; helpers de data civil/calendario, `productiveMinutes`, turnos, estoque, Gantt, Calendario V2, persistencia e services nao foram tocados.
Proxima missao sugerida: extrair somente helpers puros de data civil/calendario da `PlanningPage.js`, se auditoria continuar indicando baixo risco.

---

### 2026-08-07 14:31 — REF-021 — Primeira extracao cirurgica de formatadores e normalizadores puros

Status: CONCLUIDA
Executor/agent: Codex coordenador; JARVIS implementou escopo cirurgico; Toto validou tecnicamente por teste focado e suite; Max nao executou homologacao manual por nao haver mudanca operacional visivel.
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-testing`.
Branch/commit de referencia: `rebuild-production-calendar` / `5f7b69c53e25bbc4d14c9bd2f4e3871c3661570c`; commit-base oficial `5f7b69c`.
Objetivo: retirar da `PlanningPage.js` somente funcoes puras de formatacao e normalizacao, colocando-as em modulo neutro e testavel sem alterar comportamento.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-001_PLANNING_PAGE_MAP.md`, `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md`, `pages/PlanningPage.js`, `package.json`, testes que leem `PlanningPage.js` e buscas por duplicacoes/consumidores.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-presentation/planningFormatters.js`, `tests/planningFormatters.test.js`, `docs/refactor/REF-021_PLANNING_FORMATTERS_EXTRACTION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: `PlanningPage.js` passou a importar nove helpers de `shared/planning-presentation/planningFormatters.js`; as definicoes locais foram removidas; novo teste de caracterizacao importa diretamente o modulo extraido; documento de evidencia REF-021 criado.
Testes/comandos: antes, `git status --short`, `git rev-parse HEAD`, `git branch --show-current` e `node --test tests/*.js` confirmaram worktree limpo, HEAD `5f7b69c...` e 51/51; depois, `node --check shared/planning-presentation/planningFormatters.js`, `node --check pages/PlanningPage.js`, `node --test tests/planningFormatters.test.js` e `node --test tests/*.js`.
Resultado: teste focado passou; suite completa final passou com 52 testes, 52 aprovados e 0 falhos. Correcao factual posterior a REF-022: a contagem fisica correta da `PlanningPage.js` ao final da REF-021 / commit `c404baf` e 7183 linhas; o valor 6804 registrado originalmente estava incorreto.
Homologacao: nao marcada; teste verde nao substitui homologacao operacional. REF-013 permanece pendente.
Checkboxes atualizados: REF-021 registrada como concluida no checkpoint de refatoracao; commit-base `5f7b69c`, funcoes extraidas e resultado da suite registrados; proxima extracao recomendada registrada sem execucao.
Riscos/pendencias: helpers homonimos em outras paginas/services foram apenas mapeados; `parsePtBrDecimal('1234,56')` preserva comportamento historico hora-like; `isValidDateOnly` ficou duplicado como helper privado no novo modulo para nao exportar funcao fora do grupo autorizado; Calendario V2 nao foi removido.
Proxima missao sugerida: extrair somente helpers puros de duracao e tempo civil da `PlanningPage.js`, com teste focado, sem tocar em calendario manual, Gantt, V2, estoque, services ou persistencia.

---

### 2026-08-07 00:00 — REF-020 — Checkpoint tecnico e validacao do gate de refatoracao

Status: CONCLUIDA
Executor/agent: Codex em missao de auditoria/checkpoint, sem alteracao produtiva
Skills usadas: `acofer-investigation`, `acofer-testing`; skill Git especifica nao estava disponivel nesta sessao
Branch/commit de referencia: `rebuild-production-calendar` / `73b261a5f10a2c33e29995e0bdc6c18190c15a40`
Objetivo: congelar conceitualmente o worktree funcional atual, confirmar baseline 51/51, identificar todos os arquivos necessarios e validar o gate antes da primeira extracao da `PlanningPage.js`.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-000_BASELINE.md`, `docs/refactor/REF-001_PLANNING_PAGE_MAP.md`, `docs/refactor/REF-002_V2_GANTT_COUPLING.md`, `docs/refactor/REF-003_LARGE_FILES_AUDIT.md`, `docs/refactor/REF-010_BASELINE_FAILURE_INVESTIGATION.md`, `docs/refactor/REF-011_PLANNING_CONSTRAINT_DATE_FIX.md`, `docs/refactor/REF-012_MANUAL_SCHEDULE_EDIT_ORDER_FIX.md`, `docs/refactor/REF-013_FLOW_TO_GANTT_FOCUS.md`, `docs/refactor/REF-014_MANUAL_STOCK_PARTIAL_MODAL_TEST.md`, `docs/refactor/REF-015_PRODUCTION_CALENDAR_DAY_HEADER_HARNESS.md`, `package.json`, `.gitignore` e inventarios Git do worktree.
Arquivos alterados: `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: criado documento de evidencia do checkpoint tecnico, com baseline, inventario completo, classificacao do worktree, sensiveis, residuos, analise do `.gitignore`, proveniencia, estrategia de checkpoint, comandos recomendados ao Gu, criterios do gate e primeira extracao recomendada. Plano Mestre atualizado com checkboxes do checkpoint e entrada no historico.
Testes/comandos: `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, `git status --porcelain=v1`, `git diff --stat`, `git diff --name-status`, `git ls-files --others --exclude-standard`, `node --version`, `node --test tests/*.js`, checagens nao destrutivas de `.gitignore`, sensiveis por nome e residuos em `tmp/`.
Resultado: Node `v24.16.0`; suite `node --test tests/*.js` com 51 testes, 51 aprovados e 0 falhos; 41 arquivos rastreados modificados; 68 arquivos nao rastreados antes do documento de evidencia e 69 no estado final da missao; `.env` ignorado e nao aberto; nenhum sensivel rastreado identificado; `tmp/` classificado como residuo.
Homologacao: nenhuma homologacao manual executada ou marcada. REF-013 permanece pendente.
Checkboxes atualizados: checkpoint tecnico registrado, baseline 51/51 registrado, checkpoint manual pendente, gate liberado com condicao de checkpoint manual, primeira extracao recomendada registrada sem iniciar.
Riscos/pendencias: estado funcional depende de arquivos nao rastreados ate o checkpoint manual; avisos LF -> CRLF observados; V2 ainda legado/fallback; REF-013 ainda requer homologacao manual.
Proxima missao sugerida: executar somente a primeira extracao aprovada pelo gate: helpers puros de formatacao/normalizacao da `PlanningPage.js` para `shared/planning-presentation/planningFormatters.js`, apos o checkpoint manual do Gu.

---

### 2026-08-06 19:40 — REF-015 — Corrigir harness DOM do productionCalendarDayHeader

Status: CONCLUIDA
Executor/agent: Codex em missao de correcao pequena e delimitada; validacao tecnica por suite automatizada
Skills usadas: `acofer-investigation`, `acofer-manual-calendar`, `acofer-production-calendar-ui`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `73b261a5f10a2c33e29995e0bdc6c18190c15a40`
Objetivo: corrigir somente o harness DOM de `tests/productionCalendarDayHeader.test.js`, preservando o comportamento produtivo do Calendario V2.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `CALENDAR_V2_ARCHITECTURE.md`, `docs/refactor/REF-010_BASELINE_FAILURE_INVESTIGATION.md`, `docs/refactor/REF-014_MANUAL_STOCK_PARTIAL_MODAL_TEST.md`, `tests/productionCalendarDayHeader.test.js`, `shared/production-calendar/ProductionCalendarGrid.js`, `shared/production-calendar/productionCalendar.utils.js` e testes relacionados de grid, horizonte, stage, edit button, split editor, memberships, configuracao e Gantt.
Arquivos alterados: `tests/productionCalendarDayHeader.test.js`, `docs/refactor/REF-015_PRODUCTION_CALENDAR_DAY_HEADER_HARNESS.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: `FakeElement` passou a implementar `querySelector`, `querySelectorAll`, `remove`, `setAttribute` para `class`/`data-*` e `document.createElementNS`; seletores suportados ficaram explicitos e restritos ao contrato usado pelo grid. Nenhum codigo produtivo foi alterado.
Testes/comandos: antes, `node --test tests/productionCalendarDayHeader.test.js` falhou em `ProductionCalendarGrid.js:72` por ausencia de `grid.querySelector`; depois, o teste isolado passou. Testes relacionados de calendario V2 e Gantt passaram. `node --test tests/*.js` executado.
Resultado anterior: 51 testes, 50 aprovados e 1 falho.
Resultado novo: 51 testes, 51 aprovados e 0 falhos.
Contrato registrado: `HTMLElement.querySelector` remove SVG antigo de conectores por `.production-calendar-transport-connectors`; no caminho com transporte tambem ha seletores `.production-calendar-card[data-allocation-id="..."]` e `.production-calendar-transport-connector`. O teste atual nao valida transporte como intencao principal; os conectores fazem parte da montagem do grid.
Homologacao: nao marcada; teste verde nao homologa o Calendario V2 nem substitui homologacao manual. Homologacao manual da REF-013 permanece pendente.
Checkboxes atualizados: `Day Header DOM` marcado como corrigido; `Suite base sem falhas inexplicadas` marcada; baseline automatizado registrado como verde em 51/51.
Gate: primeira extracao da `PlanningPage.js` nao liberada automaticamente; proximo passo deve ser checkpoint tecnico e validacao explicita do gate.
Riscos/pendencias: teste e legado temporario enquanto o V2 existir; deve ser removido ou migrado no gate de exclusao do V2; harness nao cobre navegador real, pixels, medidas reais de SVG, drag, backend, banco ou persistencia.
Proxima missao sugerida: checkpoint tecnico e validacao do gate antes da primeira extracao da PlanningPage.js.

---

### 2026-08-06 19:25 — REF-014 — Corrigir teste comportamental do modal de estoque parcial

Status: CONCLUIDA
Executor/agent: Codex em missao de correcao pequena e delimitada; revisao tecnica por Toto Wolff; leitura operacional por Max Verstappen
Skills usadas: `acofer-investigation`, `acofer-manual-calendar`, `acofer-stock`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `73b261a5f10a2c33e29995e0bdc6c18190c15a40`
Objetivo: corrigir `tests/planningManualStockPartialModal.test.js` para validar comportamento real do fluxo parcial de estoque sem depender de recorte textual fragil.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-010_BASELINE_FAILURE_INVESTIGATION.md`, `docs/refactor/REF-013_FLOW_TO_GANTT_FOCUS.md`, `tests/planningManualStockPartialModal.test.js`, trecho de `pages/PlanningPage.js` relativo a `openManualStockPartialMoveModal`, `openManualStockUnavailableModal` e `productionCalendarMoveRunner`, `services/manualScheduleTransaction.service.js`, `services/manualScheduleDraft.service.js`, services de estoque/validacao/projecao e testes relacionados a estoque parcial, transacao manual e validacao.
Arquivos alterados: `tests/planningManualStockPartialModal.test.js`, `docs/refactor/REF-014_MANUAL_STOCK_PARTIAL_MODAL_TEST.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: teste antigo deixou de recortar `productionCalendarMoveRunner` ate `focusCalendarCardFromFlow`; o novo teste usa extracao balanceada do runner para contrato estrutural e harness controlado para sucesso, rejeicao total, parcial com data viavel/inviavel e erro controlado. Nenhum codigo produtivo foi alterado.
Testes/comandos: antes, `node --test tests/planningManualStockPartialModal.test.js` falhou por slice vazando para codigo posterior com `simulateCurrent`; depois, o teste isolado passou. Testes relacionados de transacao, integracao manual, estoque/projecao, validacao, draft, historico, persistencia e batch stock passaram. `node --test tests/*.js` executado.
Resultado anterior: 51 testes, 49 aprovados e 2 falhos.
Resultado novo: 51 testes, 50 aprovados e 1 falho.
Contrato registrado: fluxo parcial de estoque passa por `applyManualScheduleTransaction`, usa `manualMovePolicy: 'stock_only_independent'`, encaminha contexto fresco de estoque, aplica somente transacao aceita, preserva ultimo draft aceito em rejeicao/erro e nao chama solver, `simulateCurrent`, `scheduleOperations` ou `reoptimizePlanningFuture`.
Homologacao: teste tecnico aprovado por Toto; Max validou o fluxo em leitura com restricoes. Homologacao manual em navegador nao executada; homologacao manual da REF-013 permanece pendente.
Checkboxes atualizados: `Stock Partial Modal` marcado como corrigido; correcao REF-014 registrada em `Correcoes concluidas apos REF-010`.
Gate: gate de correcao por falha segue liberado; gate de extracao da `PlanningPage.js` permanece bloqueado enquanto houver 1 falha na suite base.
Riscos/pendencias: permanece `productionCalendarDayHeader.test.js`; o harness nao substitui drag real no browser, console visual, backend, banco, refresh/reopen ou persistencia server-side; homologacao manual REF-013 segue pendente.
Proxima missao sugerida: corrigir `productionCalendarDayHeader.test.js` como ultima falha pendente da suite, completando o harness DOM do V2 ou isolando o cabecalho em helper testavel sem alterar comportamento produtivo.

---

### 2026-08-06 19:07 — REF-013 — Restaurar foco Fluxo Produtivo -> Gantt APS por allocationId

Status: CONCLUIDA
Executor/agent: Codex em missao de correcao pequena e delimitada
Skills usadas: `acofer-investigation`, `acofer-manual-calendar`, `acofer-production-calendar-ui`, `acofer-testing`, `acofer-implementation`
Branch/commit de referencia: `rebuild-production-calendar` / `73b261a5f10a2c33e29995e0bdc6c18190c15a40`
Objetivo: restaurar a ponte Fluxo Produtivo -> Gantt APS por `allocationId`, preservando detalhes do no e usando somente o lifecycle neutro do renderer host.
Arquivos lidos: `AGENTS.md`, este plano, skills carregadas, `docs/refactor/REF-001_PLANNING_PAGE_MAP.md`, `docs/refactor/REF-002_V2_GANTT_COUPLING.md`, `docs/refactor/REF-010_BASELINE_FAILURE_INVESTIGATION.md`, `docs/refactor/REF-012_MANUAL_SCHEDULE_EDIT_ORDER_FIX.md`, `pages/PlanningPage.js`, `shared/planning-schedule-view/planningScheduleRenderer.js`, `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`, `shared/planning-schedule-view/planningScheduleViewModel.js`, `shared/planning-schedule-view/productionCalendarV2.renderer.js`, `tests/planningManualScheduleIntegration.test.js`, `tests/planningScheduleRenderer.test.js` e testes relacionados a Gantt, view model, allocation, memberships, foco, viewport e selecao.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-schedule-view/planningScheduleRenderer.js`, `tests/planningManualScheduleIntegration.test.js`, `tests/planningScheduleRenderer.test.js`, `docs/refactor/REF-013_FLOW_TO_GANTT_FOCUS.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: `PlanningPage.js` ganhou helpers para resolver/focar allocation do fluxo por ID direto, operacao, material/producao e multiplas partes deterministicas; nos do fluxo passaram a carregar operation/producao; click/teclado abrem detalhes e solicitam foco ao host; host aceita renderer sem `focusAllocation`; testes foram migrados de regex fragil para harness comportamental de resolucao/delegacao.
Testes/comandos: antes da alteracao, `node --test tests/planningManualScheduleIntegration.test.js` falhou com `harness do movimento manual deve existir` e `node --test tests/planningScheduleRenderer.test.js` falhou por regex de foco ausente; depois, ambos passaram. Testes relacionados executados: `ganttApsRenderer`, `planningScheduleViewModel`, `planningAllocation`, `productionCalendarMemberships`, `productionCalendarEditButton`, `productionCalendarGrid`, `productionCalendarHorizon`, `productionCalendarSplitEditor`, `productionCalendarStage`, `productionDisplayColor`, alem de `node --check` nos arquivos produtivos tocados.
Resultado anterior: 51 testes, 47 aprovados e 4 falhos.
Resultado novo: 51 testes, 49 aprovados e 2 falhos.
Contrato registrado: Fluxo Produtivo -> detalhes + `planningScheduleRendererHost.focusAllocation(allocationId)`; foco usa `allocationId` canonico; `PlanningPage.js` nao acessa DOM interno do Gantt.
Homologacao: manual pendente para o Gu executar; roteiro registrado em `docs/refactor/REF-013_FLOW_TO_GANTT_FOCUS.md`.
Checkboxes atualizados: `Manual Schedule Integration` e `Renderer focus` marcados como corrigidos; correcao REF-013 registrada em `Correcoes concluidas apos REF-010`.
Gate: gate de correcao por falha segue liberado; gate de extracao da `PlanningPage.js` permanece bloqueado enquanto houver 2 falhas na suite base.
Riscos/pendencias: permanecem `planningManualStockPartialModal.test.js` e `productionCalendarDayHeader.test.js`; fallback material/producao e conservador quando no legado nao tiver operationId; homologacao manual nao executada.
Proxima missao sugerida: corrigir `planningManualStockPartialModal.test.js` por comportamento/harness do fluxo parcial de estoque.

---

### 2026-08-06 18:50 — REF-012 — Preservar posicao ao editar allocation no draft manual

Status: CONCLUIDA
Executor/agent: Codex em missao de correcao pequena e delimitada
Skills usadas: `acofer-investigation`, `acofer-manual-calendar`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `73b261a5f10a2c33e29995e0bdc6c18190c15a40`
Objetivo: formalizar e implementar o contrato de que a edicao de uma allocation existente substitui essa allocation na mesma posicao do array do draft manual.
Arquivos lidos: `AGENTS.md`, este plano, `.agents/skills/acofer-investigation/SKILL.md`, `.agents/skills/acofer-manual-calendar/SKILL.md`, `.agents/skills/acofer-testing/SKILL.md`, `docs/refactor/REF-010_BASELINE_FAILURE_INVESTIGATION.md`, `docs/refactor/REF-011_PLANNING_CONSTRAINT_DATE_FIX.md`, `services/manualScheduleDraft.service.js`, `tests/manualScheduleAllocationSplit.service.test.js` e testes relacionados a draft, split, transacao, persistencia, reotimizacao, memberships e etapas.
Arquivos alterados: `services/manualScheduleDraft.service.js`, `tests/manualScheduleAllocationSplit.service.test.js`, `docs/refactor/REF-012_MANUAL_SCHEDULE_EDIT_ORDER_FIX.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: `editDraftAllocation` passou a substituir a allocation alvo por `allocationId` no mesmo indice via `map`, preservando a ordem dos demais itens; o teste de split/edicao passou a validar indice, ordem, identidade, linhagem, quantidade, componentes, parte irma e duplicidade de IDs.
Testes/comandos: `node --test tests/manualScheduleAllocationSplit.service.test.js` reproduziu a falha 30.25 !== 42.35 antes da alteracao; depois passou com 13 testes, 13 aprovados e 0 falhos; testes relacionados de draft/transacao/persistencia/reotimizacao/memberships passaram, exceto `planningManualScheduleIntegration.test.js`, ja listado como falha remanescente; `node --test tests/*.js` retornou 51 testes, 47 aprovados e 4 falhos.
Resultado anterior: 51 testes, 46 aprovados e 5 falhos.
Resultado novo: 51 testes, 47 aprovados e 4 falhos.
Contrato registrado: edicao de allocation existente preserva posicao no array do draft manual; nao houve ordenacao global.
Checkboxes atualizados: tarefa `Split localizado` marcada; correcao REF-012 registrada em `Correcoes concluidas apos REF-010`.
Gate: gate de correcao por falha segue liberado; gate de extracao da `PlanningPage.js` permanece bloqueado enquanto houver 4 falhas na suite base.
Riscos/pendencias: permanecem `planningManualScheduleIntegration.test.js`, `planningManualStockPartialModal.test.js`, `planningScheduleRenderer.test.js` e `productionCalendarDayHeader.test.js`.
Proxima missao sugerida: corrigir `planningScheduleRenderer.test.js`/foco Fluxo -> Gantt.

---

### 2026-08-06 — REF-010/Recalculation — Correção temporal do planningConstraintRecalculation

Status: CONCLUÍDA
Executor/agent: Codex em missão de correção de teste
Skills usadas: `acofer-investigation`, `acofer-testing`
Branch/commit de referência: `rebuild-production-calendar` / `73b261a`
Objetivo: corrigir exclusivamente `tests/planningConstraintRecalculation.service.test.js` para remover dependência de datas fixas envelhecíveis, preservando a regra produtiva de passado somente leitura.
Arquivos lidos: `AGENTS.md`, este plano, `.agents/skills/acofer-investigation/SKILL.md`, `.agents/skills/acofer-testing/SKILL.md`, `docs/refactor/REF-000_BASELINE.md`, `docs/refactor/REF-010_BASELINE_FAILURE_INVESTIGATION.md`, `tests/planningConstraintRecalculation.service.test.js` e trechos executados de `services/planning.service.js`.
Arquivos alterados: `tests/planningConstraintRecalculation.service.test.js`, `docs/refactor/REF-011_PLANNING_CONSTRAINT_DATE_FIX.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: fixture temporal relativa em `America/Sao_Paulo`, data-base futura em sexta-feira, offsets derivados para quinta/sabado/domingo/segunda/terca/fim do plano e helper de recalc diferenciado para edicao de equipe versus restricao de capacidade.
Testes/comandos: `node --test tests/planningConstraintRecalculation.service.test.js` reproduziu a falha temporal antes da alteracao; depois passou com 1 teste, 1 aprovado e 0 falhos; `node --test tests/*.js` passou para 51 testes, 46 aprovados e 5 falhos.
Resultado anterior: 51 testes, 45 aprovados e 6 falhos.
Resultado novo: 51 testes, 46 aprovados e 5 falhos.
Regra produtiva: protecao de producoes anteriores a hoje nao foi alterada.
Checkboxes atualizados: tarefa `Recalculation: eliminar dependencia da data atual` marcada; REF-010/Recalculation registrado como corrigido por evidencia REF-011.
Gate: gate de correcao por falha segue liberado; gate de extracao da `PlanningPage.js` permanece bloqueado enquanto houver cinco falhas na suite base.
Riscos/pendencias: cinco falhas restantes continuam pendentes; baseline geral ainda nao esta verde.
Proxima missao sugerida: corrigir `planningScheduleRenderer.test.js`/foco Fluxo -> Gantt, por combinar divergencia funcional pontual com teste estatico fragil.

---

### 2026-08-06 18:27 — REF-010 — Investigação das seis falhas de baseline

Status: CONCLUÍDA
Executor/agent: Codex coordenador em modo de investigação
Skills usadas: `acofer-investigation`, `acofer-manual-calendar`, `acofer-stock`, `acofer-production-calendar-ui`, `acofer-reoptimization`, `acofer-testing`
Branch/commit de referência: `rebuild-production-calendar` / `73b261a5f10a2c33e29995e0bdc6c18190c15a40`
Objetivo: reproduzir isoladamente e classificar as seis falhas do baseline, sem alterar código produtivo, testes ou snapshots.
Arquivos lidos: `AGENTS.md`, este plano, `.agents/skills/acofer-investigation/SKILL.md`, `docs/refactor/REF-000_BASELINE.md`, `docs/refactor/REF-001_PLANNING_PAGE_MAP.md`, `docs/refactor/REF-002_V2_GANTT_COUPLING.md`, `docs/refactor/REF-003_LARGE_FILES_AUDIT.md`, documentos APS, `CALENDAR_V2_ARCHITECTURE.md`, seis testes falhos, `pages/PlanningPage.js`, services de draft/transação/planejamento e renderers/calendário envolvidos.
Arquivos alterados: `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`, `docs/refactor/REF-010_BASELINE_FAILURE_INVESTIGATION.md`, `docs/refactor/REF-001_PLANNING_PAGE_MAP.md`.
Resumo do diff: novo relatório de evidências REF-010, log/checklist do Plano Mestre e correção factual da contagem da `PlanningPage.js` para 7097 linhas.
Testes/comandos: seis `node --test tests/<arquivo>.js` isolados; inspeção direta por `rg`, `git log`, `git blame`, `git show`; checagens de contagem por `rg`, Node e `Get-Content -Raw`.
Resultado: as seis falhas foram reproduzidas e classificadas: split com contrato de ordem indefinido/possível defeito; recalculation dependente da data atual; integration e stock modal com testes estáticos frágeis; renderer focus com divergência funcional de foco; day header com harness DOM incompleto/V2 legado.
Homologação: não aplicável; investigação sem mudança operacional.
Checkboxes atualizados: REF-010 marcado como investigação concluída; seis diagnósticos adicionados e marcados; gate de justificativa registrado; gate de suíte verde permanece pendente.
Riscos/pendências: correções ainda não implementadas; suíte base continua falha; extração da `PlanningPage.js` segue bloqueada; foco Fluxo → Gantt e contrato de ordem de split precisam de decisão/correção.
Próxima missão sugerida: corrigir primeiro `planningConstraintRecalculation.service.test.js` com relógio/fixture determinística, sem alterar regra produtiva.

---

### 2026-08-06 — REF-000 a REF-003 — Auditoria read-only inicial

Status: CONCLUÍDA
Executor/agent: Codex coordenador em modo de auditoria
Skills usadas: `acofer-investigation`
Branch/commit de referência: `rebuild-production-calendar` / `73b261a5f10a2c33e29995e0bdc6c18190c15a40`
Objetivo: registrar baseline seguro, mapear `pages/PlanningPage.js`, auditar acoplamento Calendário V2 -> Gantt APS e auditar os arquivos grandes listados.
Arquivos lidos: `AGENTS.md`, este plano, `.agents/skills/acofer-investigation/SKILL.md`, `docs/APS_GANTT_ARCHITECTURE.md`, `docs/APS_GANTT_TASKS.md`, `docs/APS_GANTT_EVOLUTION_LOG.md`, `pages/PlanningPage.js`, `shared/production-calendar/*`, `shared/planning-schedule-view/*`, `services/planning.service.js`, `pages/AnalysisPage.js`, `pages/ImportHistoryPage.js`, `server/routes/planning.routes.js`, `services/planningReoptimization.service.js`, `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`, `style.css`, `shared/CalendarTimeline.js`, `package.json` e `tests/*`.
Arquivos alterados: `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`, `docs/refactor/REF-000_BASELINE.md`, `docs/refactor/REF-001_PLANNING_PAGE_MAP.md`, `docs/refactor/REF-002_V2_GANTT_COUPLING.md`, `docs/refactor/REF-003_LARGE_FILES_AUDIT.md`.
Resumo do diff: apenas documentos de auditoria e checkboxes/log do Plano Mestre; nenhum código produtivo foi alterado.
Testes/comandos: `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, `git diff --stat`, `node --version`, leitura de `package.json`, busca segura de `.env`, `node --test tests/*.js` no sandbox e reteste autorizado fora do sandbox.
Resultado: baseline registrado; suíte completa fora do sandbox repetiu 51 testes, 45 aprovados e 6 falhos; `PlanningPage.js` mapeada em 7097 linhas após correção factual da REF-010; matriz V2/Gantt criada; arquivos grandes classificados.
Homologação: não aplicável; auditoria sem mudança operacional.
Checkboxes atualizados: REF-000, REF-001, REF-002 e REF-003 marcados como concluídos.
Riscos/pendências: árvore de trabalho ampla sem commit; `.env` presente e não lido; documentação APS diverge do runtime atual sobre `auto` em trechos históricos; Gantt ainda mantém V2 como fallback e usa nomes/ponte `productionCalendar*`; 6 testes falhos permanecem sem correção nesta missão.
Próxima missão sugerida: REF-010 — Corrigir ou reclassificar falhas da suíte base.

---

### 2026-08-06 — Criação do plano mestre

Status: CONCLUÍDA

Objetivo: consolidar a estratégia da Opção 2, o baseline técnico observado, as fases, gates, checklists, regras para Codex e critérios de aceite.

Evidências de baseline:

- `PlanningPage.js`: aproximadamente 7.097 linhas;
- `style.css`: aproximadamente 8.108 linhas;
- Gantt com renderer próprio e movimento horizontal;
- V2 ainda registrado como fallback;
- dependências diretas de `shared/production-calendar/` na página e no Gantt;
- árvore de trabalho com muitas mudanças não commitadas;
- suíte em 06/08/2026: 51 testes, 45 aprovados e 6 falhas.

Alterações de código produtivo: nenhuma.

Próxima missão: REF-000 a REF-003 em auditoria read-only.

---

### 2026-08-10 - REF-039 - Neutralizar helpers de maquina usados pelo Gantt

Status: CONCLUIDA
Executor/agent: Codex em missao de neutralizacao pequena; auditoria read-only por Rogerio Ceni
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `2b345c0`
Baseline: worktree inicial limpo; `node --test tests/*.js` inicial com 95 testes, 95 aprovados e 0 falhas.
Objetivo: remover do Gantt APS a dependencia em `shared/production-calendar/productionCalendar.utils.js` somente para helpers neutros de maquina.
Arquivos lidos: `AGENTS.md`, este plano, `docs/refactor/REF-038_CALENDARIO_V2_COUPLING_NEUTRALIZATION.md`, `shared/production-calendar/productionCalendar.utils.js`, `shared/planning-schedule-view/gantt-aps/ganttAps.geometry.js`, `shared/production-calendar/productionCalendar.adapter.js`, `shared/production-calendar/index.js`, `tests/ganttApsRenderer.test.js`, `tests/productionCalendarGrid.test.js`, `tests/planningScheduleRenderer.test.js` e consumidores diretos localizados por `rg`.
Arquivos alterados: `shared/planning-schedule/planningMachineOrder.js`, `shared/production-calendar/productionCalendar.utils.js`, `shared/planning-schedule-view/gantt-aps/ganttAps.geometry.js`, `tests/ganttApsRenderer.test.js`, `tests/planningMachineOrder.test.js`, `docs/refactor/REF-039_MACHINE_HELPERS_NEUTRALIZATION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: criado modulo neutro `planningMachineOrder` com a implementacao canonica de normalizacao e ordenacao de maquinas; `productionCalendar.utils.js` passou a reexportar os nomes antigos e usar o comparador neutro internamente; `ganttAps.geometry.js` passou a importar `comparePlanningMachineOrder`; teste do Gantt passou a exigir o import neutro e teste novo cobre ordem, normalizacao, aliases, desconhecidos, vazios/nulos, comparacao deterministica e re-export antigo.
Gate registrado: `normalizeProductionCalendarMachineName` e `compareProductionCalendarMachineOrder` sao usados fora do V2, nao tem DOM/render V2, nao usam estado V2, nao tem regra especifica do Calendario V2, preservam API por re-export e puderam ser movidos mecanicamente sem mudanca de comportamento.
Cadeia antes: `Gantt geometry -> productionCalendar.utils.js`.
Cadeia depois: `Gantt geometry -> shared/planning-schedule/planningMachineOrder.js`.
Testes/comandos: `node --check shared/planning-schedule/planningMachineOrder.js`; `node --check shared/planning-schedule-view/gantt-aps/ganttAps.geometry.js`; `node --check shared/production-calendar/productionCalendar.utils.js`; `node --test tests/planningMachineOrder.test.js`; `node --test tests/ganttApsRenderer.test.js`; `node --test tests/productionCalendarGrid.test.js`; `node --test tests/planningScheduleRenderer.test.js`; `node --test tests/*.js`; `git diff --check`.
Resultado: testes focados aprovados; suite final com 96 testes, 96 aprovados e 0 falhas; `git diff --check` sem erros, apenas avisos LF -> CRLF conhecidos.
Homologacao: nao executada em browser; mudanca estrutural de import/export e helper puro, sem alteracao de renderer, DOM, movimento, persistencia, estoque, solver ou capacidade.
Checkboxes atualizados: REF-039 registrada como concluida em Fase 3; consumidores, gate, cadeia antes/depois, re-export e blockers restantes registrados.
Riscos/pendencias: REF-013 homologacao manual, fallback/renderer V2, `ProductionCalendar`, editor/split visual compartilhado, adapter, demais utilities V2, stock-only, identidade manual, autosave/descarte, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade permanecem pendentes.
Proxima missao sugerida: neutralizar o adapter de schedule com re-export, preservando `allocationId`, memberships e IDs `readonly:*`.

---

### 2026-08-10 - REF-040 - Auditar e neutralizar o adapter compartilhado de schedule

Status: CONCLUIDA
Executor/agent: Codex em missao estrutural; auditoria read-only por Rogerio Ceni; analise tecnica de testes por Toto Wolff
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `9f44924`
Baseline: worktree inicial limpo; `node --test tests/*.js` inicial com 96 testes, 96 aprovados e 0 falhas.
Objetivo: auditar `productionCalendar.adapter.js` e mover somente o nucleo neutro de adaptacao de schedule quando a fronteira fosse segura.
Arquivos lidos: `AGENTS.md`, este plano, `docs/refactor/REF-038_CALENDARIO_V2_COUPLING_NEUTRALIZATION.md`, `docs/refactor/REF-039_MACHINE_HELPERS_NEUTRALIZATION.md`, `shared/production-calendar/productionCalendar.adapter.js`, `shared/production-calendar/index.js`, `pages/PlanningPage.js`, `shared/planning-schedule-view/*`, consumidores diretos localizados por `rg` e testes relacionados a memberships, grid, stage, Gantt, renderer e batch stock.
Arquivos alterados: `shared/planning-schedule/planningScheduleAdapter.js`, `shared/production-calendar/productionCalendar.adapter.js`, `pages/PlanningPage.js`, `tests/planningScheduleAdapter.test.js`, `tests/planningDailyBatchStock.service.test.js`, `tests/productionCalendarStage.test.js`, `docs/refactor/REF-040_SCHEDULE_ADAPTER_NEUTRALIZATION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: o nucleo do adapter foi movido mecanicamente para `shared/planning-schedule/planningScheduleAdapter.js`; o export neutro principal passou a ser `adaptPlanningResultToScheduleSnapshot`; o caminho antigo reexporta `adaptPlanningResultToProductionCalendar` para compatibilidade; `PlanningPage.js` e o teste de batch stock passaram a importar a fonte neutra; testes V2 antigos continuam validando o re-export legado.
Gate registrado: `adaptPlanningResultToProductionCalendar`, `buildProductionStageIndex` e `buildProductionMembershipIndex` nao dependem de DOM, estado visual V2, API, scheduler, persistencia ou regra de render; preservam assinatura/retorno via re-export antigo e mantem IDs/memberships/ordem sem alteracao comportamental.
Mapa de identidade registrado: `allocationId` existente vence o fallback; fallback `readonly:*` preservado; `operationId`, `productionId`, `calendarParentOperationId`, `parentOperationId`, `machineId`, `sequence`, `productionStage` e `productionMemberships` preservados; `parentAllocationId`, `splitParentId` e `splitOrder` seguem nao materializados pelo adapter atual, sem criacao de campo novo.
Cadeia antes: `PlanningPage.js -> production-calendar/index.js -> productionCalendar.adapter.js`; testes diretos -> `production-calendar/productionCalendar.adapter.js`.
Cadeia depois: `PlanningPage.js -> shared/planning-schedule/planningScheduleAdapter.js`; `planningDailyBatchStock` -> modulo neutro; `production-calendar/index.js -> productionCalendar.adapter.js -> modulo neutro` para compatibilidade V2.
Testes/comandos: `node --check shared/production-calendar/productionCalendar.adapter.js`; `node --check shared/planning-schedule/planningScheduleAdapter.js`; `node --check pages/PlanningPage.js`; `node --test tests/planningScheduleAdapter.test.js`; `node --test tests/planningDailyBatchStock.service.test.js`; `node --test tests/productionCalendarMemberships.test.js`; `node --test tests/productionCalendarGrid.test.js`; `node --test tests/productionCalendarStage.test.js`; `node --test tests/ganttApsRenderer.test.js`; `node --test tests/planningScheduleRenderer.test.js`; `node --test tests/*.js`; `git diff --check`.
Resultado: testes focados aprovados; suite final com 97 testes, 97 aprovados e 0 falhas; `git diff --check` sem erros, apenas avisos conhecidos LF -> CRLF.
Homologacao: nao executada em browser; mudanca estrutural de import/export e adapter puro, sem alteracao de renderer, DOM, movimento manual, persistencia, estoque, solver, capacidade ou CSS.
Checkboxes atualizados: REF-040 registrada como concluida em Fase 3; baseline, exports auditados, mapa de identidade, fronteira neutra, extracao, re-export e testes registrados.
Riscos/pendencias: REF-013 homologacao manual, fallback/renderer V2, `ProductionCalendar`, editor/split visual, demais utilities V2, stock-only, identidade manual nao neutralizada, autosave/descarte, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade permanecem pendentes.
Proxima missao sugerida: neutralizar helpers de dia/snapshot ainda usados fora do grid V2, sem tocar renderer/fallback.

---

### 2026-08-10 - REF-041 - Neutralizar helpers civis de dia/snapshot

Status: CONCLUIDA
Executor/agent: Codex em missao pequena de neutralizacao; metodologia JARVIS/Toto aplicada pelo coordenador
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `f0c9085`
Baseline: worktree inicial limpo; `node --test tests/*.js` inicial com 97 testes, 97 aprovados e 0 falhas.
Objetivo: auditar os helpers restantes de `productionCalendar.utils.js` e mover somente helpers neutros de leitura/normalizacao civil de dia, snapshot e transformacao pura, sem tocar capacidade, turnos, feriados como regra produtiva, finais de semana como regra produtiva, `manualWorkDates`, estoque, solver ou reotimizacao.
Arquivos lidos: `AGENTS.md`, este plano, `docs/refactor/REF-038_CALENDARIO_V2_COUPLING_NEUTRALIZATION.md`, `docs/refactor/REF-039_MACHINE_HELPERS_NEUTRALIZATION.md`, `docs/refactor/REF-040_SCHEDULE_ADAPTER_NEUTRALIZATION.md`, `shared/production-calendar/productionCalendar.utils.js`, `shared/production-calendar/index.js`, `shared/production-calendar/ProductionCalendar.js`, `shared/production-calendar/ProductionCalendarGrid.js`, `shared/planning-schedule/*`, `shared/planning-schedule-view/*`, `pages/PlanningPage.js`, consumidores localizados por `rg` e testes relacionados.
Arquivos alterados: `shared/planning-schedule/planningScheduleDay.js`, `shared/production-calendar/productionCalendar.utils.js`, `pages/PlanningPage.js`, `tests/planningScheduleDay.test.js`, `docs/refactor/REF-041_SCHEDULE_DAY_HELPERS_NEUTRALIZATION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Inventario/classificacao: movidos como neutros `formatProductionCalendarDate`, `getProductionCalendarWeekday`, `addProductionCalendarDays`, `getProductionCalendarProductionLimitDate`, `normalizeProductionCalendarDay` e `fillProductionCalendarDayRange`; mantidos como V2/grid `getProductionCalendarDayCardCounts`, `groupAllocationsByMachineAndDate`, `createProductionCalendarGridRows`, `formatProductionCalendarCompactNumber`; mantidos por regra produtiva/ambigua `buildProductionCalendarDayProductivity`, `buildProductionCalendarDayPresentation`, `isProductionCalendarNonWorkingDay` e `extendProductionCalendarDayRange`; `normalizeProductionCalendarMachineName` e `compareProductionCalendarMachineOrder` permanecem registrados como ja neutralizados na REF-039.
Resumo do diff: criado `planningScheduleDay` com a implementacao canonica dos helpers civis UTC; `productionCalendar.utils.js` passou a reexportar nomes legados e usar os auxiliares neutros para evitar duplicacao; `PlanningPage.js` passou a importar `fillPlanningScheduleDayRange` do namespace neutro com alias local legado; teste novo caracteriza timezone, parsing, fallbacks, mutabilidade rasa, duplicatas, excecao historica com `null` e re-export antigo.
Gate registrado: helpers movidos nao tem DOM, estado visual V2, capacidade, jornada, pessoas, estoque, solver, persistencia ou regra produtiva; assinatura/retorno e timezone foram preservados; comportamentos estranhos existentes nao foram corrigidos.
Re-exports: nomes `ProductionCalendar*` civis continuam disponiveis apenas em `shared/production-calendar/productionCalendar.utils.js` e no barrel antigo para compatibilidade temporaria.
Testes/comandos: `node --check shared/planning-schedule/planningScheduleDay.js`; `node --check shared/production-calendar/productionCalendar.utils.js`; `node --check pages/PlanningPage.js`; `node --test tests/planningScheduleDay.test.js`; `node --test tests/productionCalendarGrid.test.js`; `node --test tests/productionCalendarDayHeader.test.js`; `node --test tests/productionCalendarHorizon.test.js`; `node --test tests/ganttApsRenderer.test.js`; `node --test tests/planningScheduleRenderer.test.js`; `node --test tests/*.js`; `git diff --check`.
Resultado: testes focados aprovados; suite final com 98 testes, 98 aprovados e 0 falhas; `git diff --check` sem erros, apenas avisos conhecidos LF -> CRLF.
Homologacao: nao executada em browser; mudanca estrutural de import/export e helpers puros, sem alteracao de renderer, DOM, movimento manual, persistencia, estoque, solver, reotimizacao, capacidade ou CSS.
Checkboxes atualizados: REF-041 registrada como concluida em Fase 3; baseline, inventario, classificacao, gate, re-exports, testes e blockers restantes registrados.
Riscos/pendencias: REF-013 homologacao manual, renderer/fallback V2, `ProductionCalendar`, editor/split visual, helpers V2 puros, `productiveMinutes`, turnos/capacidade, stock-only, identidade manual restante, autosave/descarte e `generatePlanningCode` permanecem pendentes.
Proxima missao sugerida: auditar editor/split visual compartilhado para definir se existe fronteira neutra de apresentacao operacional sem mover regra transacional.

---

### 2026-08-10 - REF-042 - Neutralizar editor/split visual compartilhado do planejamento

Status: CONCLUIDA
Executor/agent: Codex em missao de neutralizacao estrutural; auditoria read-only por Rogerio Ceni
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-manual-calendar`, `acofer-production-calendar-ui`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `8cd1dbc`
Baseline: worktree inicial limpo; `node --test tests/*.js` inicial com 98 testes, 98 aprovados e 0 falhas.
Objetivo: auditar se `ProductionCalendarEditor` e `ProductionCalendarSplitEditor` eram UI operacional compartilhada e mover somente a camada visual segura para namespace neutro.
Arquivos lidos: `AGENTS.md`, este plano, `docs/refactor/REF-037_PLANNING_ALLOCATION_EDITOR_CONTROLLER_EXTRACTION.md`, `docs/refactor/REF-038_CALENDARIO_V2_COUPLING_NEUTRALIZATION.md`, `docs/refactor/REF-040_SCHEDULE_ADAPTER_NEUTRALIZATION.md`, `docs/refactor/REF-041_SCHEDULE_DAY_HELPERS_NEUTRALIZATION.md`, `pages/PlanningPage.js`, `shared/production-calendar/ProductionCalendarEditor.js`, `shared/production-calendar/ProductionCalendarSplitEditor.js`, `shared/production-calendar/index.js`, `shared/planning-controller/planningAllocationEditorController.js`, CSS e testes relacionados.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-editor/PlanningAllocationEditor.js`, `shared/planning-editor/PlanningAllocationSplitEditor.js`, `shared/planning-editor/planningAllocationDisplay.js`, `shared/planning-editor/planningAllocationEditorFormatters.js`, `shared/planning-editor/index.js`, `shared/production-calendar/ProductionCalendarEditor.js`, `shared/production-calendar/ProductionCalendarSplitEditor.js`, `tests/productionCalendarEditButton.test.js`, `tests/productionCalendarSplitEditor.test.js`, `tests/planningReoptimization.service.test.js`, `docs/refactor/REF-042_PLANNING_EDITOR_VISUAL_NEUTRALIZATION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: os editores visuais foram movidos para `shared/planning-editor/` com nomes neutros; a pagina passou a usar `PlanningAllocationEditor`; o calculo canonico de distribuicao/split passou a ser recebido por callbacks explicitos; caminhos antigos do V2 viraram wrappers compativeis; CSS `production-calendar-*` foi preservado.
Gate registrado: editor principal usado pelo planejamento/Gantt via pagina, sem estado interno de `ProductionCalendar`, sem grid V2, sem solver/reotimizacao e sem transaction direta; split editor legado sem consumidor produtivo direto confirmado, mas neutralizado como compatibilidade segura; ambos preservam API por wrappers.
Testes/comandos: `node --check pages/PlanningPage.js`; `node --check shared/planning-editor/PlanningAllocationEditor.js`; `node --check shared/planning-editor/PlanningAllocationSplitEditor.js`; `node --test tests/productionCalendarEditButton.test.js`; `node --test tests/productionCalendarSplitEditor.test.js`; `node --test tests/productionCalendarConfigurationEdit.integration.test.js`; `node --test tests/manualScheduleEditCapacityOverride.test.js`; `node --test tests/planningAllocationEditorController.test.js`; `node --test tests/planningReoptimization.service.test.js`; suite completa e `git diff --check`.
Resultado: testes focados aprovados; suite final `node --test tests/*.js` com 98 testes, 98 aprovados e 0 falhas; `git diff --check` sem erros, apenas avisos conhecidos LF -> CRLF.
Homologacao: nao executada em browser; mudanca estrutural de import/export e injecao de callbacks, sem redesign, CSS, renderer, solver, persistencia, estoque ou regra produtiva nova.
Checkboxes atualizados: REF-023 registrada como concluida pela REF-042; baseline, consumidores, gate, CSS, extracao, compatibilidade, testes e blockers restantes registrados.
Riscos/pendencias: REF-013 homologacao manual, renderer/fallback V2, `ProductionCalendar`/grid, CSS V2 ou CSS compartilhado dos modais, helpers V2 puros, `productiveMinutes`, turnos/capacidade, stock-only, identidade manual restante, autosave/descarte e `generatePlanningCode` permanecem pendentes.
Proxima missao sugerida: neutralizar CSS compartilhado dos editores em namespace proprio, mantendo classes antigas por compatibilidade temporaria.

---

# 14. Quadro de status geral

| Fase | Estado |
|---|---|
| Fase 0 — Preservação e baseline | `[x]` |
| Fase 1 — Auditoria arquitetural | `[x]` |
| Fase 2 — Testes de caracterização | `[ ]` |
| Fase 3 — Fronteiras neutras | `[ ]` |
| Fase 4 — Gantt-only | `[ ]` |
| Fase 5 — Remoção V2 | `[ ]` |
| Fase 6 — Divisão PlanningPage | `[ ]` |
| Fase 7 — CSS necessário | `[ ]` |
| Fase 8 — Outros arquivos grandes | `[ ]` |
| Fase 9 — Regressão e homologação | `[ ]` |
| Fase 10 — Encerramento | `[ ]` |

---

# 15. Condição de conclusão do projeto

A reestruturação só termina quando todas as afirmações abaixo forem verdadeiras:

- [ ] O sistema continua executando as regras atuais do APS.
- [ ] O Gantt APS é a única interface de calendário ativa.
- [ ] Não existe fallback funcional para o Calendário V2.
- [ ] O Gantt não depende de componente visual V2.
- [ ] A `PlanningPage.js` não é mais um monólito de múltiplos domínios.
- [ ] Features possuem fronteiras claras e testes focados.
- [ ] Nenhum ID ou contrato persistido foi quebrado.
- [ ] Planejamentos antigos abrem normalmente.
- [ ] Draft manual sobrevive a save, refresh e reopen.
- [ ] Movimento, split, transporte e reotimização preservam invariantes.
- [ ] Testes técnicos estão aprovados.
- [ ] Homologação operacional está aprovada pelo Gu.
- [ ] Documentação e `AGENTS.md` refletem a arquitetura final.
- [ ] O projeto está preparado para iniciar futuramente a V2/Line em uma cópia controlada.

---

## Nota final para Codex

Este trabalho não é uma corrida para criar muitos arquivos. O objetivo é reduzir o risco do sistema sem mudar sua inteligência produtiva.

Antes de mover qualquer função, responda:

1. qual responsabilidade ela possui;
2. de quais estados ela depende;
3. quem é a fonte canônica da regra;
4. quais consumidores existem;
5. qual teste protege seu comportamento;
6. como reverter a alteração;
7. por que o novo módulo melhora a arquitetura.

Se essas respostas não estiverem claras, a missão ainda está em fase de investigação.

---

### 2026-08-10 - REF-043 - Desligar fallback automatico Gantt APS -> Calendario V2

Status: CONCLUIDA
Executor/agent: Codex em missao pequena de Gantt-only parcial; metodologia JARVIS/Toto aplicada pelo coordenador; homologacao operacional limitada a revisao estrutural/read-only.
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-testing`, `acofer-operational-homologation`
Branch/commit de referencia: `rebuild-production-calendar` / `78a795a`
Baseline: worktree inicial limpo; `node --test tests/*.js` inicial com 98 testes, 98 aprovados e 0 falhas.
Objetivo: remover somente o fallback automatico que montava `production-calendar-v2` quando o lifecycle do Gantt APS falhava.
Arquivos lidos: `AGENTS.md`, este plano, `docs/refactor/REF-038_CALENDARIO_V2_COUPLING_NEUTRALIZATION.md`, `docs/refactor/REF-042_PLANNING_EDITOR_VISUAL_NEUTRALIZATION.md`, `shared/planning-schedule-view/planningScheduleRenderer.js`, `shared/planning-schedule-view/productionCalendarV2.renderer.js`, `shared/planning-schedule-view/index.js`, `shared/planning-schedule-view/gantt-aps/*`, `shared/planning-schedule-view/**`, `pages/PlanningPage.js` no trecho de selecao do renderer e testes relacionados.
Arquivos alterados: `shared/planning-schedule-view/planningScheduleRenderer.js`, `pages/PlanningPage.js`, `tests/planningScheduleRenderer.test.js`, `docs/refactor/REF-043_GANTT_DISABLE_V2_AUTOMATIC_FALLBACK.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Gate registrado: `auto/default` ja resolvia `gantt-aps`; Gantt monta planejamento saudavel nos testes; editor/split compartilhados usam namespace neutro; adapter, cor e helpers necessarios ao Gantt ja estao desacoplados do pacote visual V2.
Resumo do diff: removido `mountFallback` do host; `mount` e `update` agora preservam cleanup/onLifecycleError e relancam erro do Gantt; mensagem da pagina deixou de afirmar rollback para Calendario V2; teste do renderer protege default/auto, mount/update saudavel, falhas sem V2, cleanup do Gantt falho e selecao explicita V2.
Cadeia antes: Gantt mount/update -> erro -> destroy -> `production-calendar-v2`.
Cadeia depois: Gantt mount/update -> sucesso permanece Gantt; erro -> cleanup + diagnostico/log por lifecycle + throw; sem V2 automatico.
Compatibilidade V2: enum, factory, renderer V2, `ProductionCalendar` e selecao explicita temporaria permanecem fisicamente disponiveis.
Testes/comandos: `node --check shared/planning-schedule-view/planningScheduleRenderer.js`; `node --check pages/PlanningPage.js`; `node --test tests/planningScheduleRenderer.test.js`; `node --test tests/ganttApsRenderer.test.js`; `node --test tests/productionCalendarGrid.test.js`; `node --test tests/productionCalendarEditButton.test.js`; `node --test tests/productionCalendarSplitEditor.test.js`; `node --test tests/*.js`; `git diff --check`.
Resultado: testes focados aprovados; suite final 98 testes, 98 aprovados e 0 falhas; `git diff --check` sem erros, apenas avisos conhecidos LF -> CRLF.
Homologacao: browser nao executado; registrada apenas homologacao estrutural/read-only. Esta REF nao conclui REF-013.
Riscos/pendencias: REF-013 homologacao manual, remocao fisica do renderer/ProductionCalendar/grid V2, CSS V2/compartilhado, flags/config legado, helpers V2 puros, `productiveMinutes`, turnos/capacidade, stock-only, identidade manual restante, autosave/descarte e `generatePlanningCode` permanecem pendentes.
Proxima missao sugerida: remover a selecao explicita/config legado do V2, mantendo ainda os arquivos fisicos ate a missao de remocao definitiva.

---

### 2026-08-12 - REF-045 - Remover selecao/configuracao operacional do Calendario V2

Status: CONCLUIDA TECNICAMENTE
Executor/agent: Codex em missao pequena de Gantt-only; metodologia JARVIS/Toto aplicada pelo coordenador.
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-production-calendar-ui`, `acofer-testing`.
Branch/commit de referencia: `rebuild-production-calendar` / `dd97ef8`.
Baseline: worktree inicial limpo; `node --test tests/*.js` inicial com 98 testes, 98 aprovados e 0 falhas.
Objetivo: remover somente portas operacionais que permitiam selecionar/configurar `production-calendar-v2` como renderer do Planejamento, preservando implementacao fisica V2.
Arquivos lidos: `AGENTS.md`, este plano, `docs/refactor/REF-043_GANTT_DISABLE_V2_AUTOMATIC_FALLBACK.md`, `docs/refactor/REF-044_GANTT_EDIT_SPLIT_PARITY.md`, `shared/planning-schedule-view/planningScheduleRenderer.js`, `shared/planning-schedule-view/index.js`, `shared/planning-schedule-view/productionCalendarV2.renderer.js`, `pages/PlanningPage.js`, `tests/planningScheduleRenderer.test.js`, `tests/ganttApsRenderer.test.js`, `tests/productionCalendarEditButton.test.js` e ocorrencias via `rg`.
Arquivos alterados: `shared/planning-schedule-view/planningScheduleRenderer.js`, `shared/planning-schedule-view/index.js`, `pages/PlanningPage.js`, `tests/planningScheduleRenderer.test.js`, `tests/ganttApsRenderer.test.js`, `docs/refactor/REF-045_REMOVE_V2_RENDERER_SELECTION.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: removido `PRODUCTION_CALENDAR_V2` do enum ativo; `production-calendar-v2` e `autoPolicy` para V2 agora resolvem `gantt-aps`; barrel operacional deixou de exportar factory/adaptador V2; `PlanningPage` deixou de registrar factory V2 e de ler `globalThis.PLANNING_SCHEDULE_RENDERER`, montando explicitamente `gantt-aps`.
Gate registrado: Gantt default, fallback automatico V2 desligado, Gantt com move/edit/split, edit/split conectados ao editor neutro, editor/controller sem dependencia do renderer V2 e nenhum fluxo saudavel da `PlanningPage` exigindo factory V2 operacional.
Compatibilidade preservada: `fallbackRenderer` permanece no-op; `autoPolicy` permanece na assinatura; `ProductionCalendar`, `ProductionCalendarGrid`, `productionCalendarV2.renderer.js`, CSS V2, wrappers legados e testes fisicos V2 permanecem.
Preservado por risco/missao propria: `USE_PRODUCTION_CALENDAR_V2`, `CalendarTimeline`, `timelineOperations`, snapshot helpers, callbacks de editor, estoque/projecao, warning/diagnostic helpers e fullscreen/exclusive view.
Testes/comandos: `node --check shared/planning-schedule-view/planningScheduleRenderer.js`; `node --check pages/PlanningPage.js`; `node --test tests/planningScheduleRenderer.test.js`; `node --test tests/ganttApsRenderer.test.js`; `node --test tests/productionCalendarEditButton.test.js`; `node --test tests/productionCalendarSplitEditor.test.js`; `node --test tests/planningAllocationEditorController.test.js`; `node --test tests/*.js`; `git diff --check`.
Resultado: testes focados aprovados; suite final 98 testes, 98 aprovados e 0 falhas; `git diff --check` sem erros, apenas avisos conhecidos LF -> CRLF.
Homologacao: browser nao executado; esta REF nao conclui REF-013.
Checkboxes atualizados: REF-032/Gantt-only marcada como parcial, com montagem explicita Gantt, bloqueio de fallback V2, V2 fisico preservado e regressao completa registrados.
Riscos/pendencias: REF-013 homologacao manual; remocao fisica do renderer/ProductionCalendar/grid/CSS/wrappers/testes V2; remocao do fallback morto `USE_PRODUCTION_CALENDAR_V2 -> CalendarTimeline` em missao propria; documentacao historica antiga ainda menciona rollback V2.
Proxima missao sugerida: remover o fallback morto `USE_PRODUCTION_CALENDAR_V2 -> CalendarTimeline` da `PlanningPage`, preservando `CalendarTimeline` para Analise/Comercial.

---

### 2026-08-12 - REF-046 - Remover fallback CalendarTimeline da PlanningPage

Status: CONCLUIDA TECNICAMENTE
Executor/agent: Codex em missao pequena de Gantt-only; metodologia JARVIS/Toto aplicada pelo coordenador.
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-production-calendar-ui`, `acofer-testing`.
Branch/commit de referencia: `rebuild-production-calendar` / `7ce0840`.
Baseline: worktree inicial limpo; `node --test tests/*.js` inicial falhou no sandbox por `spawn EPERM`; repetido fora do sandbox com 98 testes, 98 aprovados e 0 falhas.
Objetivo: remover somente o ramo morto `USE_PRODUCTION_CALENDAR_V2 -> CalendarTimeline` dentro da `PlanningPage`, sem remover `CalendarTimeline` globalmente.
Arquivos lidos: `AGENTS.md`, este plano, `docs/refactor/REF-045_REMOVE_V2_RENDERER_SELECTION.md`, `pages/PlanningPage.js`, `shared/CalendarTimeline.js`, `tests/planningScheduleRenderer.test.js`, `tests/ganttApsRenderer.test.js`, `pages/AnalysisPage.js`, `pages/CommercialCalendarPage.js` e ocorrencias via `rg`.
Arquivos alterados: `pages/PlanningPage.js`, `tests/planningScheduleRenderer.test.js`, `tests/ganttApsRenderer.test.js`, `docs/refactor/REF-046_REMOVE_PLANNING_CALENDAR_TIMELINE_FALLBACK.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Resumo do diff: removidos o import de `CalendarTimeline`, a constante `USE_PRODUCTION_CALENDAR_V2` e o branch condicional morto que montava `CalendarTimeline`; o fluxo restante sempre constroi snapshot/view model e monta o host Gantt APS com `renderer: 'gantt-aps'`.
Gate registrado: `PlanningPage` ja tinha factory unica Gantt; `CalendarTimeline` nao era fallback necessario; Gantt mantem move/edit/split; o ramo `!USE_PRODUCTION_CALENDAR_V2` era inalcancavel; `CalendarTimeline` segue ativo em Analise/Comercial.
Helpers preservados: `timelineOperations` preservado por uso em `simulatedProductionByDate`; snapshot/adapters, stock helpers, diagnostics, fullscreen, callbacks de editor e `ProductionCalendar` fisico preservados.
Helpers removidos: nenhum helper alem do branch/import/flag exclusivos do fallback morto.
Contrato final: `PlanningPage` nao contem `USE_PRODUCTION_CALENDAR_V2`, nao importa/chama `CalendarTimeline`, monta Gantt APS, propaga erro pelo host e nao monta alternativa visual silenciosa.
Compatibilidade preservada: `shared/CalendarTimeline.js`, consumidores de Analise/Comercial e `productionCalendarV2.renderer.js` permanecem fisicamente presentes.
Testes/comandos: `node --check pages/PlanningPage.js`; `node --test tests/planningScheduleRenderer.test.js`; `node --test tests/ganttApsRenderer.test.js`; `node --test tests/productionCalendarEditButton.test.js`; `node --test tests/*.js`; `git diff --check`.
Resultado: testes focados aprovados; suite final 98 testes, 98 aprovados e 0 falhas; `git diff --check` sem erros, apenas avisos conhecidos LF -> CRLF.
Homologacao: browser nao executado; esta REF nao conclui REF-013.
Checkboxes atualizados: item `remover USE_PRODUCTION_CALENDAR_V2` marcado; Fase 4 e Fase 5 continuam abertas por homologacao e remocao fisica V2 pendentes.
Riscos/pendencias: REF-013 homologacao manual; remocao fisica de renderer/ProductionCalendar/grid/CSS/wrappers/testes V2; consumidores Analise/Comercial bloqueiam remocao global de `CalendarTimeline`; documentacao historica ainda menciona estados antigos.
Proxima missao sugerida: auditar `ProductionCalendar` fisico e `productionCalendarV2.renderer.js` para separar consumidores reais antes de qualquer remocao definitiva do V2.

---

### 2026-08-12 - REF-047 - Remover productionCalendarV2.renderer.js

Status: CONCLUIDA TECNICAMENTE
Executor/agent: Codex em missao pequena de remocao fisica do adapter V2; metodologia JARVIS/Toto aplicada pelo coordenador.
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-testing`.
Branch/commit de referencia: `rebuild-production-calendar` / `8f1a6ad`.
Baseline: worktree inicial limpo; `node --test tests/*.js` inicial com 98 testes, 98 aprovados e 0 falhas.
Objetivo: auditar consumidores e remover fisicamente somente `shared/planning-schedule-view/productionCalendarV2.renderer.js`, sem remover componentes internos de `shared/production-calendar/*`.
Arquivos lidos: `AGENTS.md`, este plano, `docs/refactor/REF-045_REMOVE_V2_RENDERER_SELECTION.md`, `docs/refactor/REF-046_REMOVE_PLANNING_CALENDAR_TIMELINE_FALLBACK.md`, `shared/planning-schedule-view/productionCalendarV2.renderer.js`, `shared/planning-schedule-view/index.js`, `shared/planning-schedule-view/planningScheduleRenderer.js`, `pages/PlanningPage.js`, `shared/production-calendar/index.js`, `tests/planningScheduleRenderer.test.js`, `tests/planningScheduleViewModel.test.js`, `tests/ganttApsRenderer.test.js` e ocorrencias via `rg`.
Arquivos alterados/removidos: removido `shared/planning-schedule-view/productionCalendarV2.renderer.js`; alterados `tests/planningScheduleRenderer.test.js`, `tests/planningScheduleViewModel.test.js`, `docs/refactor/REF-047_REMOVE_PRODUCTION_CALENDAR_V2_RENDERER.md` e este plano.
Resumo do diff: removido o adapter/renderer V2 fisico e as caracterizacoes que importavam artificialmente `createProductionCalendarV2Renderer` e `planningScheduleViewToProductionCalendarSnapshot`; testes passaram a proteger ausencia fisica do arquivo, ausencia no barrel/pagina e manutencao do contrato neutro/Gantt.
Gate registrado: `PlanningPage` monta factory unica Gantt APS; barrel operacional nao exporta V2; host nao seleciona V2; `production-calendar-v2` normaliza para Gantt; nenhum runtime importa `createProductionCalendarV2Renderer`; nenhum runtime usa `planningScheduleViewToProductionCalendarSnapshot`; Gantt mantem move/edit/split.
Funcoes removidas: `planningScheduleViewToProductionCalendarSnapshot`, `createProductionCalendarV2Renderer`, `cloneValue`, `defaultRenderSnapshot` e `escapeSelectorValue`.
Componentes preservados: `ProductionCalendar.js`, `ProductionCalendarGrid.js`, cards, drag/state, toolbar, details, CSS, wrappers editor/split, helpers legados e testes fisicos de componentes V2.
Testes/comandos: `node --check pages/PlanningPage.js`; `node --check shared/planning-schedule-view/planningScheduleRenderer.js`; `node --test tests/planningScheduleRenderer.test.js`; `node --test tests/ganttApsRenderer.test.js`; `node --test tests/productionCalendarEditButton.test.js`; `node --test tests/productionCalendarSplitEditor.test.js`; `node --test tests/planningScheduleViewModel.test.js`; `node --test tests/*.js`; `git diff --check`; buscas finais por `productionCalendarV2.renderer`, `createProductionCalendarV2Renderer`, `planningScheduleViewToProductionCalendarSnapshot`.
Resultado: testes focados aprovados; suite final `node --test tests/*.js` com 98 testes, 98 aprovados e 0 falhas; `git diff --check` sem erros, apenas avisos conhecidos LF -> CRLF; busca final sem consumidores runtime do renderer removido.
Homologacao: browser nao executado; esta REF nao conclui REF-013.
Checkboxes atualizados: REF-040 marcada como parcial, com enum, factory, arquivo fisico, global override e testes de lifecycle concluidos; Fase 5 continua aberta por componentes/CSS/wrappers V2 remanescentes.
Riscos/pendencias: REF-013 homologacao manual; remocao fisica de `ProductionCalendar`, grid, toolbar, details, drag/state, CSS, wrappers legados e testes exclusivos V2; documentacao historica antiga ainda registra estados anteriores.
Proxima missao sugerida: auditar `ProductionCalendar.js` e seus consumidores diretos para decidir a proxima remocao fisica segura, preservando CSS/wrappers ate prova propria.

---

### 2026-08-12 - REF-048 - Auditar ProductionCalendar.js e a arvore shared/production-calendar

Status: CONCLUIDA TECNICAMENTE SEM REMOCAO FISICA
Executor/agent: Codex em missao de auditoria/documentacao; metodologia JARVIS/Toto aplicada pelo coordenador.
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-production-calendar-ui`, `acofer-testing`.
Branch/commit de referencia: `rebuild-production-calendar` / `14838e6`.
Baseline: worktree inicial limpo; `node --test tests/*.js` inicial com 98 testes, 98 aprovados e 0 falhas.
Objetivo: mapear todos os arquivos/exportacoes de `shared/production-calendar/*`, consumidores runtime/teste, CSS/DOM acoplado e proximo lote seguro de remocao.
Arquivos lidos: `AGENTS.md`, este plano, `docs/refactor/REF-042_PLANNING_EDITOR_VISUAL_NEUTRALIZATION.md`, `docs/refactor/REF-044_GANTT_EDIT_SPLIT_PARITY.md`, `docs/refactor/REF-045_REMOVE_V2_RENDERER_SELECTION.md`, `docs/refactor/REF-047_REMOVE_PRODUCTION_CALENDAR_V2_RENDERER.md`, `pages/PlanningPage.js`, `shared/production-calendar/*`, `shared/planning-editor/*`, testes `productionCalendar*.test.js`, `tests/ganttApsRenderer.test.js`, `tests/productionCalendarEditButton.test.js`, `tests/productionCalendarSplitEditor.test.js`, `tests/planningScheduleRenderer.test.js` e buscas globais via `rg`/`Select-String`.
Arquivos alterados: `docs/refactor/REF-048_PRODUCTION_CALENDAR_TREE_AUDIT.md` e este plano.
Resumo do diff: criada auditoria com arvore real de 15 arquivos, tabela por arquivo, grafo de dependencias, classificacao A/B/C/D, mapeamento CSS/editor neutro e proximo lote recomendado; Plano Mestre atualizado sem marcar remocao total do V2 como concluida.
Consumidores runtime encontrados: `PlanningPage.js` ainda importa `shared/production-calendar/index.js`; `renderProductionCalendarSnapshot(...)` ainda monta `ProductionCalendar(...)`, mas o fluxo operacional atual `renderProductionCalendar(...)` monta factory unica `gantt-aps`; editor neutro nao importa JS V2, mas usa CSS `production-calendar-editor-*`.
Grupos: Grupo A nenhum removivel agora; Grupo B wrappers legados (`ProductionCalendarEditor.js`, `ProductionCalendarSplitEditor.js`, `productionCalendar.adapter.js`, `productionDisplayColor.js`, aliases utils); Grupo C compartilhados (`production-calendar.css`, helpers de dia/produtividade/horizonte, `index.js`); Grupo D regra sensivel (helpers de dia/capacidade/produtividade e wrappers que chamam services canonicos de split).
Remocao fisica: nenhuma, porque os gates de candidato sem consumidor runtime/teste/CSS compartilhado nao foram satisfeitos.
Testes/comandos finais: `node --check pages/PlanningPage.js`; `node --test tests/ganttApsRenderer.test.js`; `node --test tests/productionCalendarEditButton.test.js`; `node --test tests/productionCalendarSplitEditor.test.js`; `node --test tests/productionCalendarGrid.test.js`; `node --test tests/productionCalendarDayHeader.test.js`; `node --test tests/planningScheduleRenderer.test.js`; `node --test tests/*.js`; `git diff --check`.
Resultado: checks focados aprovados; suite final `node --test tests/*.js` com 98 testes, 98 aprovados e 0 falhas; `git diff --check` sem erros, apenas aviso conhecido de futura conversao LF -> CRLF no Plano Mestre.
Homologacao: browser nao executado; esta REF nao conclui REF-013.
Blockers: REF-013 pendente; `PlanningPage.js` ainda acoplada ao barrel V2; CSS do editor neutro ainda depende de `production-calendar.css`; testes V2 ainda caracterizam componentes fisicos.
Proxima missao sugerida: desacoplar `PlanningPage.js` do barrel `shared/production-calendar/index.js` e remover a funcao legada `renderProductionCalendarSnapshot(...)` se a busca continuar confirmando ausencia de chamada operacional.

---

### 2026-08-12 - REF-049 - Desacoplar PlanningPage do barrel V2

Status: CONCLUIDA TECNICAMENTE
Executor/agent: Codex em missao pequena de desacoplamento runtime; metodologia JARVIS/Toto aplicada pelo coordenador.
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-production-calendar-ui`, `acofer-testing`.
Branch/commit de referencia: `rebuild-production-calendar` / `c7f7bed`.
Baseline: worktree inicial limpo; `node --test tests/*.js` inicial com 98 testes, 98 aprovados e 0 falhas.
Objetivo: remover o acoplamento residual da `PlanningPage.js` com `shared/production-calendar/index.js`, preservando Gantt APS como renderer operacional unico.
Arquivos lidos: `AGENTS.md`, este plano, `docs/refactor/REF-048_PRODUCTION_CALENDAR_TREE_AUDIT.md`, `pages/PlanningPage.js`, `shared/production-calendar/index.js`, arquivos exportados pelo barrel, modulos neutros existentes e testes relacionados.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-editor/planningAllocationEditorCss.js`, `tests/planningScheduleRenderer.test.js`, `tests/ganttApsRenderer.test.js`, `tests/productionCalendarEditButton.test.js`, `docs/refactor/REF-049_PLANNING_PAGE_V2_BARREL_DECOUPLING.md` e este plano.
Resumo do diff: `PlanningPage.js` deixou de importar o barrel V2; helpers sensiveis de dia/produtividade/horizonte passaram para import direto de `productionCalendar.utils.js`; criado loader neutro para preservar `production-calendar.css` no editor; removidos `renderProductionCalendarSnapshot(...)`, sua montagem de `ProductionCalendar(...)` e o helper de warning exclusivo do renderer legado.
Gate registrado: busca global confirmou ausencia de caller runtime real de `renderProductionCalendarSnapshot(...)`; ocorrencias restantes sao componente fisico, testes ou documentacao historica.
CSS: `production-calendar.css` nao foi removido; carregamento necessario ao editor neutro passou por `shared/planning-editor/planningAllocationEditorCss.js`, preservando `data-production-calendar-css`.
Helpers preservados: `buildProductionCalendarDayPresentation`, `buildProductionCalendarDayProductivity`, `extendProductionCalendarDayRange` e regras internas de dia/non-working/horizonte permaneceram no modulo atual, sem neutralizacao oportunistica.
Contrato final: `PlanningPage.js -> helpers diretos/loader CSS/editor neutro -> Gantt APS`; sem `PlanningPage.js -> shared/production-calendar/index.js`, sem `ProductionCalendar(...)` e sem `renderProductionCalendarSnapshot(...)`.
Testes/comandos: `node --check pages/PlanningPage.js`; `node --check shared/planning-editor/planningAllocationEditorCss.js`; `node --test tests/ganttApsRenderer.test.js`; `node --test tests/planningScheduleRenderer.test.js`; `node --test tests/productionCalendarEditButton.test.js`; `node --test tests/productionCalendarSplitEditor.test.js`; `node --test tests/productionCalendarDayHeader.test.js`; `node --test tests/productionCalendarHorizon.test.js`; `node --test tests/*.js`; `git diff --check`.
Resultado: checks e testes focados aprovados; suite final `node --test tests/*.js` com 98 testes, 98 aprovados e 0 falhas; `git diff --check` sem erros, apenas avisos conhecidos LF -> CRLF.
Homologacao: browser nao executado; esta REF nao conclui REF-013.
Blockers: CSS do editor neutro ainda usa `production-calendar-editor-*`; helpers sensiveis seguem em `productionCalendar.utils.js`; wrappers e componentes fisicos V2 continuam testados; remocao em massa de `shared/production-calendar/*` segue fora do escopo.
Proxima missao sugerida: neutralizar/isolar o CSS do editor para remover a dependencia restante de `production-calendar.css` antes da remocao fisica dos componentes V2.

---

### 2026-08-12 - REF-050 - Neutralizar CSS do editor de alocacao

Status: CONCLUIDA TECNICAMENTE
Executor/agent: Codex em missao pequena de UI/CSS; metodologia JARVIS/Toto aplicada pelo coordenador.
Skills usadas: `acofer-implementation`, `acofer-production-calendar-ui`, `acofer-testing`.
Branch/commit de referencia: `rebuild-production-calendar` / `2d467d8`.
Baseline: worktree inicial limpo; `node --test tests/*.js` inicial com 98 testes, 98 aprovados e 0 falhas.
Objetivo: remover a dependencia visual do editor neutro em `shared/production-calendar/production-calendar.css`, preservando layout e comportamento visual atual.
Arquivos lidos: `AGENTS.md`, este plano, `docs/refactor/REF-042_PLANNING_EDITOR_VISUAL_NEUTRALIZATION.md`, `docs/refactor/REF-048_PRODUCTION_CALENDAR_TREE_AUDIT.md`, `docs/refactor/REF-049_PLANNING_PAGE_V2_BARREL_DECOUPLING.md`, `shared/planning-editor/PlanningAllocationEditor.js`, `shared/planning-editor/PlanningAllocationSplitEditor.js`, `shared/planning-editor/planningAllocationEditorCss.js`, `shared/production-calendar/production-calendar.css`, `tests/productionCalendarEditButton.test.js`, `tests/productionCalendarSplitEditor.test.js` e buscas finais.
Arquivos alterados: `shared/planning-editor/planningAllocationEditorCss.js`, `shared/planning-editor/planning-allocation-editor.css`, `tests/productionCalendarEditButton.test.js`, `tests/productionCalendarSplitEditor.test.js`, `docs/refactor/REF-050_PLANNING_EDITOR_CSS_NEUTRALIZATION.md` e este plano.
Resumo do diff: criado CSS neutro do editor com os blocos editor extraidos de `production-calendar.css`; loader passou de `../production-calendar/production-calendar.css` com `data-production-calendar-css` para `./planning-allocation-editor.css` com `data-planning-allocation-editor-css`; testes passaram a proteger o loader neutro, existencia do CSS neutro e cobertura das classes usadas.
Gate registrado: editor e split continuam sem import JS V2; loader nao aponta mais para CSS V2; `production-calendar.css` permanece fisicamente presente; classes `production-calendar-editor-*` foram preservadas temporariamente; nenhuma regra produtiva foi alterada.
Testes/comandos: `node --check pages/PlanningPage.js`; `node --check shared/planning-editor/planningAllocationEditorCss.js`; `node --check shared/planning-editor/PlanningAllocationEditor.js`; `node --check shared/planning-editor/PlanningAllocationSplitEditor.js`; `node --test tests/productionCalendarEditButton.test.js`; `node --test tests/productionCalendarSplitEditor.test.js`; `node --test tests/ganttApsRenderer.test.js`; `node --test tests/planningScheduleRenderer.test.js`; `node --test tests/*.js`; `git diff --check`.
Resultado: checks e testes focados aprovados; suite final `node --test tests/*.js` com 98 testes, 98 aprovados e 0 falhas; `git diff --check` sem erros, apenas avisos conhecidos LF -> CRLF.
Homologacao: browser nao executado; esta REF nao conclui REF-013.
Blockers: componentes/testes V2 fisicos e wrappers legados ainda existem; `production-calendar.css` ainda nao pode ser apagado; helpers sensiveis seguem em `productionCalendar.utils.js`; REF-013 segue pendente.
Proxima missao sugerida: auditar e remover, em lote controlado, os componentes fisicos V2 que ja nao tenham consumidor runtime, mantendo `productionCalendar.utils.js` fora do escopo.

---

### 2026-08-12 - REF-051 - Remover nucleo visual V2 fisico orfao

Status: CORRECAO FINAL DE PARIDADE APLICADA; AGUARDANDO VALIDACAO COMPLETA/HOMOLOGACAO
Executor/agent: Codex em missao de remocao fisica controlada; metodologia JARVIS/Toto/Max aplicada pelo coordenador.
Skills usadas: `acofer-implementation`, `acofer-production-calendar-ui`, `acofer-manual-calendar`, `acofer-testing`, `acofer-operational-homologation`.
Branch/commit de referencia: `rebuild-production-calendar` / `cd94358`.
Baseline: worktree inicial limpo; `node --test tests/*.js` inicial com 98 testes, 98 aprovados e 0 falhas.
Objetivo: remover fisicamente somente componentes visuais V2 comprovadamente orfaos no runtime, preservando helpers sensiveis, wrappers, adapter, cores e CSS.
Arquivos lidos: `AGENTS.md`, este plano, `docs/refactor/REF-048_PRODUCTION_CALENDAR_TREE_AUDIT.md`, `docs/refactor/REF-049_PLANNING_PAGE_V2_BARREL_DECOUPLING.md`, `docs/refactor/REF-050_PLANNING_EDITOR_CSS_NEUTRALIZATION.md`, `pages/PlanningPage.js`, `shared/production-calendar/*`, `shared/planning-editor/*`, `shared/planning-schedule-view/*`, testes `productionCalendar*.test.js`, testes Gantt/renderers e buscas globais.
Arquivos removidos: `ProductionCalendar.js`, `ProductionCalendarGrid.js`, `ProductionCalendarToolbar.js`, `ProductionCalendarCard.js`, `ProductionCalendarDetails.js`, `ProductionCalendarDrag.js`, `ProductionCalendarState.js` e `productionCalendar.validation.js`.
Arquivos alterados: `pages/PlanningPage.js`, `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`, `shared/planning-schedule-view/gantt-aps/gantt-aps.css`, `shared/planning-schedule-view/planningScheduleViewModel.js`, `shared/production-calendar/index.js`, `tests/ganttApsRenderer.test.js`, `tests/planningScheduleRenderer.test.js`, `tests/planningScheduleViewModel.test.js`, `tests/automaticSimulationBaseline.service.test.js`, `tests/manualScheduleHistory.service.test.js`, `tests/productionCalendarDayHeader.test.js`, `tests/productionCalendarEditButton.test.js`, `tests/productionCalendarHorizon.test.js`, `tests/productionCalendarMemberships.test.js`, `tests/productionCalendarStage.test.js`, `tests/productionDisplayColor.test.js`, `docs/refactor/REF-051_PHYSICAL_V2_UI_REMOVAL.md` e este plano.
Resumo do diff: removido o nucleo DOM/estado/drag/toolbar/details/validation V2; blockers de revisao corrigidos com paridade Gantt-only para descarte global, Undo/Redo, configuracao diaria, horizonte futuro, transporte, otimizacao de utilizacao, estoque projetado do dia, produtividade/equipe/alertas diarios e diagnosticos minimos; `createGanttApsRenderer` recebeu callbacks neutros para essas intencoes; Gantt exibe acoes quando permitido e apenas emite intencoes; `PlanningPage` conecta os callbacks aos handlers canonicos existentes; view model passou a transportar capability `daySettings`; `metadata.validationIssues` transporta clone de `validation.presentation.issues`; `planningScheduleViewModel.test.js` cobre conteudo, clone e freeze; barrel deixou de exportar arquivos V2 removidos; testes passaram a proteger ausencia fisica, ausencia no barrel, Gantt move/edit/split/transporte/descarte/otimizacao/undo/redo/dia/equipe/estoque/horizonte, PlanningPage sem mount/import V2, editor neutro sem JS V2, wrappers/CSS/helpers preservados.
Arquivos preservados: `productionCalendar.utils.js`, `production-calendar.css`, `ProductionCalendarEditor.js`, `ProductionCalendarSplitEditor.js`, `productionCalendar.adapter.js`, `productionDisplayColor.js` e `index.js` residual.
Gate registrado: `PlanningPage` nao importa barrel V2 nem monta `ProductionCalendar`; renderer operacional e `gantt-aps`; matriz final V2 -> Gantt documentada em `docs/refactor/REF-051_PHYSICAL_V2_UI_REMOVAL.md`; Gantt mantem move/edit/split/zoom/fullscreen/stage/memberships e recebeu paridade para transporte, descarte, otimizacao, Undo/Redo, configuracao diaria, horizonte, estoque/produtividade/equipe diaria e diagnosticos; editor e split editor neutros nao importam JS V2; arquivos removidos estao ausentes; barrel nao exporta removidos; helpers sensiveis e CSS permanecem; busca final confirmou que os 8 arquivos candidatos continuam sem caller runtime operacional.
Testes/comandos: `node --check pages/PlanningPage.js`; `node --test tests/ganttApsRenderer.test.js`; `node --test tests/automaticSimulationBaseline.service.test.js`; `node --test tests/planningScheduleRenderer.test.js`; `node --test tests/productionCalendarEditButton.test.js`; `node --test tests/productionCalendarSplitEditor.test.js`; testes focados correlatos de day/horizon/configuracao/memberships/stage/displayColor; `node --test tests/*.js`; `git diff --check`.
Resultado: suite final 98 testes, 98 aprovados e 0 falhas; `git diff --check` sem erros, apenas avisos conhecidos LF -> CRLF; contagem permaneceu 98 porque nenhum teste foi apagado; assertions que caracterizavam CSS orfao (`production-calendar-manual-actions` e `production-calendar-discard-button`) deixaram de substituir protecao funcional.
Homologacao: browser nao executado; esta REF nao conclui REF-013.
Blockers: nenhum blocker funcional conhecido de paridade V2 -> Gantt apos a matriz final; `productionCalendar.utils.js` ainda usado pela `PlanningPage`; `production-calendar.css` ainda preservado por fullscreen/diagnosticos/wrappers; wrappers/re-exports legados continuam; nomes `productionCalendar*` residuais ainda exigem limpeza propria; REF-013 nao marcada como homologada.

---

### 2026-08-12 - REF-013 - Homologacao operacional manual do Gantt

Status: NAO EXECUTADA POR LIMITACAO DE AMBIENTE
Executor/agent: Codex coordenador; Max Verstappen consultado como homologador read-only para matriz de gates; nenhum codigo produtivo alterado.
Skills usadas: `acofer-operational-homologation`, `acofer-manual-calendar`, `acofer-production-calendar-ui`, `acofer-persistence-legacy`, `acofer-stock`, `acofer-validation-diagnostics`, `acofer-reoptimization`, `acofer-testing`.
Branch/commit de referencia: `rebuild-production-calendar` / `a73abd1`.
Pre-flight: `git status --short` sem saida; branch `rebuild-production-calendar`; HEAD `a73abd1`.
Objetivo: executar homologacao operacional real no browser para Flow -> Gantt, move, edit, split, transporte, undo/redo, descarte, dia/equipe/estoque, horizonte, zoom/fullscreen, diagnosticos e readonly apos a remocao fisica do V2.
Ambiente/runtime executado: servidor local Node/Express iniciado em `http://localhost:3000`; HTTP 200 confirmado; Chrome real iniciado com perfil temporario isolado e DevTools Protocol local; aplicacao aberta em runtime.
Evidencia observada no browser: titulo `Planejamento Aco-Fer`; URL `http://localhost:3000/`; texto visivel `Acesso ao sistema`, `Usuario ou E-mail`, `Senha`, `Entrar`; DOM sem seletores de planejamento/Gantt; abertura inicial sem HTTP 4xx/5xx inesperado.
Resultado da homologacao: checklist operacional nao executado porque nao havia sessao autenticada/dados operacionais para acessar o Planejamento/Gantt. REF-013 nao foi homologada, nao foi marcada como concluida e nao recebeu status intermediario.
Checklist: Flow -> Gantt, Flow sem allocation/split, move horizontal, edit, split, transporte, undo/redo, descarte, dia/equipe, estoque do dia, horizonte, zoom/fullscreen, diagnosticos e readonly ficaram NAO EXECUTADOS.
Arquivos alterados: `docs/refactor/REF-013_FLOW_TO_GANTT_FOCUS.md` e este plano.
Arquivos produtivos alterados: nenhum.
Blockers: limitacao ambiental de autenticacao/sessao/dados operacionais no browser local; nenhum defeito funcional do Gantt foi comprovado.
Proxima missao recomendada: preparar uma janela de homologacao assistida com sessao PCP/Visualizador valida e plano de teste com allocations reais, sem alterar codigo.

---

### 2026-08-12 - REF-044 - Paridade de edicao e split no Gantt APS

Status: CONCLUIDA
Executor/agent: Codex em missao pequena de Gantt-only parcial; metodologia JARVIS/Toto aplicada pelo coordenador.
Skills usadas: `acofer-investigation`, `acofer-implementation`, `acofer-production-calendar-ui`, `acofer-testing`
Branch/commit de referencia: `rebuild-production-calendar` / `3127ed2`
Baseline: worktree inicial limpo; `node --test tests/*.js` inicial com 98 testes, 98 aprovados e 0 falhas.
Objetivo: dar ao Gantt APS paridade operacional minima para solicitar edicao e split de allocation pelo editor neutro, sem usar o renderer V2 para abrir o editor.
Arquivos lidos: `AGENTS.md`, este plano, `docs/refactor/REF-043_GANTT_DISABLE_V2_AUTOMATIC_FALLBACK.md`, `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`, `shared/planning-schedule-view/gantt-aps/index.js`, `shared/planning-schedule-view/planningScheduleViewModel.js`, `pages/PlanningPage.js`, `shared/planning-editor/PlanningAllocationEditor.js`, `shared/planning-controller/planningAllocationEditorController.js`, `tests/ganttApsRenderer.test.js`, `tests/productionCalendarEditButton.test.js`, `tests/productionCalendarSplitEditor.test.js`.
Arquivos alterados: `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`, `pages/PlanningPage.js`, `tests/ganttApsRenderer.test.js`, `tests/productionCalendarEditButton.test.js`, `tests/planningScheduleRenderer.test.js`, `docs/refactor/REF-044_GANTT_EDIT_SPLIT_PARITY.md`, `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`.
Gate registrado: `planningScheduleTask` preserva `allocationId` como `task.id`; barras/rows usam `data-allocation-id`; `PlanningPage` resolve pelo draft/snapshot e agora aceita `allocation.allocationId ?? allocation.id`; `PlanningAllocationEditor` suporta edit e `startSplit`; save segue por `runPlanningAllocationEditorController`; solver nao foi alterado.
Resumo do diff: `createGanttApsRenderer` passou a aceitar `onRequestEdit` e `onRequestSplit`; o painel de inspecao da allocation exibe acoes explicitas quando a capability manual permite e a task e persistivel; `PlanningPage` liga edit/split ao editor neutro; testes protegem callbacks, read-only, drag, ausencia de controller/service no renderer e ponte da pagina.
Contrato final: editar chama `openProductionCalendarAllocationEditor(allocation)`; split chama `openProductionCalendarAllocationEditor(allocation, { startSplit: true })`; renderer visual apenas emite intencao e nao executa transacao.
Read-only/drag: com `manualMove=false` as acoes nao aparecem; botoes ficam fora da barra e pointerdown neles nao inicia drag nem emite `onRequestMove`.
Compatibilidade V2: `ProductionCalendar`, renderer V2, grid V2, factory/selecao V2, CSS V2, wrappers legados e testes fisicos V2 permanecem presentes.
Testes/comandos: `node --check shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`; `node --check pages/PlanningPage.js`; `node --test tests/ganttApsRenderer.test.js`; `node --test tests/productionCalendarEditButton.test.js`; `node --test tests/productionCalendarSplitEditor.test.js`; `node --test tests/planningAllocationEditorController.test.js`; `node --test tests/planningScheduleRenderer.test.js`; `node --test tests/*.js`; `git diff --check`.
Resultado: testes focados aprovados; suite final 98 testes, 98 aprovados e 0 falhas; `git diff --check` sem erros, apenas avisos conhecidos LF -> CRLF.
Homologacao: browser nao executado; esta REF nao conclui REF-013.
Riscos/pendencias: REF-013 homologacao manual, remocao fisica do renderer/ProductionCalendar/grid V2, CSS V2/compartilhado, flags/config legado, helpers V2 puros, `productiveMinutes`, turnos/capacidade, stock-only, identidade manual restante, autosave/descarte e `generatePlanningCode` permanecem pendentes.
Proxima missao sugerida: remover a selecao explicita/config legado do V2, mantendo ainda os arquivos fisicos ate a missao de remocao definitiva.
