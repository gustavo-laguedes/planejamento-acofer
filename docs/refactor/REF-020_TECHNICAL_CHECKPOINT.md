# REF-020 - Checkpoint tecnico e validacao do gate de refatoracao

Data: 2026-08-07
Modo: auditoria/checkpoint, sem alteracao de codigo produtivo, testes, migrations ou configuracao.

Nota de identificacao: o Plano Mestre ja possui uma missao futura chamada `REF-020 - Extrair identidade visual de producao`. Esta evidencia usa o identificador solicitado para o checkpoint (`REF-020_TECHNICAL_CHECKPOINT`) sem iniciar nem marcar a extracao futura como executada.

## 1. Branch e HEAD

- Branch: `rebuild-production-calendar`
- HEAD: `73b261a5f10a2c33e29995e0bdc6c18190c15a40`
- Commit HEAD curto: `73b261a`
- Observacao: o HEAD sozinho nao representa o estado funcional atual; ha alteracoes rastreadas modificadas e arquivos novos nao rastreados.

## 2. Baseline

Comandos executados:

```text
git branch --show-current
git rev-parse HEAD
git status --short
git status --porcelain=v1
git diff --stat
git diff --name-status
git ls-files --others --exclude-standard
node --version
node --test tests/*.js
```

Resultado:

- Node.js: `v24.16.0`
- Suite: `node --test tests/*.js`
- Testes: 51
- Aprovados: 51
- Falhos: 0
- Divergencia contra REF-015: nenhuma. REF-015 registrava 51/51 e o resultado foi confirmado novamente.

## 3. Inventario completo do worktree

- Arquivos rastreados modificados: 41
- Arquivos nao rastreados por `git ls-files --others --exclude-standard`: 68 antes da criacao deste documento; 69 no estado final da missao, porque `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md` tambem e novo.
- `git diff --stat`: 41 arquivos, 11425 insercoes e 1203 delecoes.
- Aviso observado: Git informa conversao futura LF -> CRLF em arquivos rastreados modificados. Isso nao bloqueia o gate, mas deve ser revisado antes do commit se o time quiser controlar fim de linha.

Categorias usadas:

- A: codigo funcional necessario
- B: teste necessario
- C: migration necessaria
- D: documentacao necessaria
- E: configuracao necessaria
- F: artefato temporario / nao versionar
- G: sensivel / nunca versionar
- H: incerto / precisa decisao
- I: gerado automaticamente
- J: legado mantido temporariamente

| Arquivo | Status Git | Categoria | Necessario para baseline? | Deve entrar no checkpoint? | Motivo |
|---|---|---:|---|---|---|
| `CALENDAR_V2_ARCHITECTURE.md` | M | D | Indireto | Sim | Documento normativo/historico do Calendario V2 usado como mapa arquitetural. |
| `pages/AnalysisPage.js` | M | A | Nao para 51/51 | Sim | Pagina funcional atual; alteracao preexistente no estado restauravel. |
| `pages/ImportHistoryPage.js` | M | A | Nao para 51/51 | Sim | Pagina funcional atual; faz parte do estado operacional. |
| `pages/PlanningPage.js` | M | A | Sim | Sim | Principal orquestrador; testes inspecionam contratos de fluxo, Gantt, estoque e modal. |
| `pages/ProductionPage.js` | M | A | Nao para 51/51 | Sim | Pagina funcional atual; parte do sistema operacional. |
| `pages/ProductivityMatrixPage.js` | M | A | Nao para 51/51 | Sim | UI da matriz produtiva; relacionada a cadastros/produtividade. |
| `pages/RegistrationsPage.js` | M | A | Nao para 51/51 | Sim | UI de cadastros; parte do estado funcional. |
| `server/routes/actuals.routes.js` | M | A | Nao para 51/51 | Sim | Rota funcional de realizado/acompanhamento. |
| `server/routes/planning.routes.js` | M | A | Sim | Sim | API de planejamento, persistencia manual e revalidacao; fonte canonica de fronteira server. |
| `server/routes/stock.routes.js` | M | A | Indireto | Sim | API de estoque usada pelo planejamento e projecoes. |
| `server/scripts/apply-schema.js` | M | E | Nao para 51/51 | Sim | Script de schema/migrations; necessario para restaurabilidade operacional. |
| `server/scripts/validate-schema.js` | M | E | Nao para 51/51 | Sim | Script de validacao de schema; necessario para governanca de banco. |
| `server/server.js` | M | A | Nao para 51/51 | Sim | Bootstrap backend atual. |
| `services/manualScheduleDraft.service.js` | M | A | Sim | Sim | Fonte canonica do draft manual, splits, edicao e conservacao de quantidades. |
| `services/manualSchedulePersistence.service.js` | M | A | Sim | Sim | Persistencia manual, revisao/hash e compatibilidade legado. |
| `services/manualScheduleResourceValidation.service.js` | M | A | Sim | Sim | Validacao de maquina, pessoas, setup e capacidade. |
| `services/manualScheduleStockLedger.service.js` | M | A | Sim | Sim | Ledger canonico de estoque manual. |
| `services/manualScheduleTransaction.service.js` | M | A | Sim | Sim | Coordenacao transacional de movimentos manuais. |
| `services/manualScheduleValidation.service.js` | M | A | Sim | Sim | Validacao temporal, estoque, transporte e recursos. |
| `services/planning.service.js` | M | A | Sim | Sim | Motor automatico e `buildPlan`; alto risco e essencial ao baseline. |
| `shared/Tabs.js` | M | A | Nao para 51/51 | Sim | Componente compartilhado de UI. |
| `shared/Topbar.js` | M | A | Nao para 51/51 | Sim | Topbar/notificacoes; parte da UI atual. |
| `shared/api.js` | M | A | Nao para 51/51 | Sim | Helper compartilhado de API. |
| `shared/production-calendar/ProductionCalendar.js` | M | J | Sim | Sim | Calendario V2 legado ainda ativo como fallback e coberto por testes. |
| `shared/production-calendar/ProductionCalendarCard.js` | M | J | Sim | Sim | Card V2 e cor ainda acoplada historicamente. |
| `shared/production-calendar/ProductionCalendarDetails.js` | M | J | Sim | Sim | Detalhes V2 ainda parte do pacote legado. |
| `shared/production-calendar/ProductionCalendarDrag.js` | M | J | Sim | Sim | Drag V2 legado ainda coberto e nao removido. |
| `shared/production-calendar/ProductionCalendarGrid.js` | M | J | Sim | Sim | Grid V2; teste REF-015 cobre header/harness. |
| `shared/production-calendar/ProductionCalendarState.js` | M | J | Sim | Sim | Estado visual V2 temporario. |
| `shared/production-calendar/ProductionCalendarToolbar.js` | M | J | Sim | Sim | Toolbar V2 temporaria. |
| `shared/production-calendar/index.js` | M | J | Sim | Sim | Barrel V2 e injecao CSS; ainda consumidor no runtime. |
| `shared/production-calendar/production-calendar.css` | M | J | Sim | Sim | CSS V2 ainda carregado enquanto fallback existir. |
| `shared/production-calendar/productionCalendar.adapter.js` | M | A | Sim | Sim | Adapter de planejamento ainda localizado no pacote V2. |
| `shared/production-calendar/productionCalendar.utils.js` | M | A/J | Sim | Sim | Utils neutros e V2 misturados; devem ser preservados antes de extrair. |
| `style.css` | M | A | Nao para 51/51 | Sim | CSS global funcional atual. |
| `tests/manualScheduleDraft.service.test.js` | M | B | Sim | Sim | Teste do draft manual. |
| `tests/manualSchedulePersistence.service.test.js` | M | B | Sim | Sim | Teste de persistencia manual. |
| `tests/manualScheduleTransaction.service.test.js` | M | B | Sim | Sim | Teste de transacao manual. |
| `tests/manualScheduleValidation.service.test.js` | M | B | Sim | Sim | Teste de validacao manual. |
| `tests/planningManualScheduleIntegration.test.js` | M | B | Sim | Sim | Teste de integracao manual e foco Fluxo -> Gantt. |
| `tests/planningManualScheduleSaveLoad.integration.test.js` | M | B | Sim | Sim | Teste integrado de save/load manual. |
| `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md` | ?? | D | Indireto | Sim | Fonte de coordenacao da reestruturacao. |
| `database/021_manual_transport_status.sql` | ?? | C | Indireto | Sim | Migration nova de status de transporte manual. |
| `docs/APS_GANTT_ARCHITECTURE.md` | ?? | D | Indireto | Sim | Arquitetura Gantt APS. |
| `docs/APS_GANTT_EVOLUTION_LOG.md` | ?? | D | Indireto | Sim | Historico de evolucao Gantt APS. |
| `docs/APS_GANTT_TASKS.md` | ?? | D | Indireto | Sim | Backlog/tarefas Gantt APS. |
| `docs/refactor/REF-000_BASELINE.md` | ?? | D | Indireto | Sim | Evidencia baseline inicial. |
| `docs/refactor/REF-001_PLANNING_PAGE_MAP.md` | ?? | D | Indireto | Sim | Mapa da PlanningPage. |
| `docs/refactor/REF-002_V2_GANTT_COUPLING.md` | ?? | D | Indireto | Sim | Acoplamento V2/Gantt. |
| `docs/refactor/REF-003_LARGE_FILES_AUDIT.md` | ?? | D | Indireto | Sim | Auditoria de arquivos grandes. |
| `docs/refactor/REF-010_BASELINE_FAILURE_INVESTIGATION.md` | ?? | D | Indireto | Sim | Investigacao das seis falhas antigas. |
| `docs/refactor/REF-011_PLANNING_CONSTRAINT_DATE_FIX.md` | ?? | D | Indireto | Sim | Evidencia da correcao temporal. |
| `docs/refactor/REF-012_MANUAL_SCHEDULE_EDIT_ORDER_FIX.md` | ?? | D | Indireto | Sim | Evidencia da correcao de ordem de split. |
| `docs/refactor/REF-013_FLOW_TO_GANTT_FOCUS.md` | ?? | D | Indireto | Sim | Evidencia de foco Fluxo -> Gantt; homologacao manual pendente. |
| `docs/refactor/REF-014_MANUAL_STOCK_PARTIAL_MODAL_TEST.md` | ?? | D | Indireto | Sim | Evidencia de teste do modal parcial. |
| `docs/refactor/REF-015_PRODUCTION_CALENDAR_DAY_HEADER_HARNESS.md` | ?? | D | Indireto | Sim | Evidencia do baseline 51/51. |
| `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md` | Novo nesta missao | D | Indireto | Sim | Evidencia deste checkpoint tecnico. |
| `services/automaticSimulationBaseline.service.js` | ?? | A | Sim | Sim | Service novo usado por testes e rotas de baseline automatico. |
| `services/manualScheduleDiagnosticPresenter.service.js` | ?? | A | Sim | Sim | Presenter canonico de diagnosticos manuais. |
| `services/manualScheduleHistory.service.js` | ?? | A | Sim | Sim | Historico undo/redo manual. |
| `services/materialStockMetrics.service.js` | ?? | A | Sim | Sim | Metricas de estoque/material. |
| `services/planningDiagnosticDelta.service.js` | ?? | A | Sim | Sim | Delta de diagnosticos para reotimizacao. |
| `services/planningReoptimization.service.js` | ?? | A | Sim | Sim | Reotimizacao de futuro; fonte canonica. |
| `services/planningStockProjection.service.js` | ?? | A | Sim | Sim | Projecao canonica de estoque do planejamento. |
| `services/productivityMatrixCatalog.service.js` | ?? | A | Sim | Sim | Catalogo de matriz produtiva. |
| `services/productivityMatrixResolution.service.js` | ?? | A | Sim | Sim | Resolucao canonica de material/maquina/pessoas. |
| `shared/browserCacheReset.js` | ?? | E | Indireto | Sim | Helper de reset/cache do browser; parte do runtime compartilhado atual. |
| `shared/planning-schedule-view/gantt-aps/gantt-aps.css` | ?? | A | Sim | Sim | CSS do Gantt APS. |
| `shared/planning-schedule-view/gantt-aps/ganttAps.geometry.js` | ?? | A | Sim | Sim | Geometria temporal/linhas do Gantt APS. |
| `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js` | ?? | A | Sim | Sim | Renderer Gantt APS atual. |
| `shared/planning-schedule-view/gantt-aps/index.js` | ?? | A | Sim | Sim | Entry point do Gantt APS. |
| `shared/planning-schedule-view/index.js` | ?? | A | Sim | Sim | Entry point do host/read model. |
| `shared/planning-schedule-view/planningScheduleRenderer.js` | ?? | A | Sim | Sim | Host neutro Gantt/V2 e foco. |
| `shared/planning-schedule-view/planningScheduleViewModel.js` | ?? | A | Sim | Sim | Read model versionado do calendario. |
| `shared/planning-schedule-view/productionCalendarV2.renderer.js` | ?? | J | Sim | Sim | Fallback V2 encapsulado no host atual. |
| `shared/production-calendar/ProductionCalendarEditor.js` | ?? | A/J | Sim | Sim | Editor operacional ainda em pacote V2 e usado no fluxo atual. |
| `shared/production-calendar/ProductionCalendarSplitEditor.js` | ?? | A/J | Sim | Sim | Split editor operacional ainda em pacote V2. |
| `shared/production-calendar/productionDisplayColor.js` | ?? | A | Sim | Sim | Cor/identidade visual compartilhada, candidata a extracao futura. |
| `tests/automaticSimulationBaseline.service.test.js` | ?? | B | Sim | Sim | Teste novo de baseline automatico. |
| `tests/ganttApsRenderer.test.js` | ?? | B | Sim | Sim | Teste do renderer Gantt APS. |
| `tests/manualScheduleAllocationSplit.service.test.js` | ?? | B | Sim | Sim | Teste critico de split e edicao localizada. |
| `tests/manualScheduleDiagnosticPresenter.service.test.js` | ?? | B | Sim | Sim | Teste de presenter de diagnosticos. |
| `tests/manualScheduleEditCapacityOverride.test.js` | ?? | B | Sim | Sim | Teste de override de capacidade. |
| `tests/manualScheduleHistory.service.test.js` | ?? | B | Sim | Sim | Teste de undo/redo historico manual. |
| `tests/materialStockMetrics.service.test.js` | ?? | B | Sim | Sim | Teste de metricas de estoque. |
| `tests/planningConstraintRecalculation.service.test.js` | ?? | B | Sim | Sim | Teste REF-011 de recalc deterministico. |
| `tests/planningCutoffSnapshot.integration.test.js` | ?? | B | Sim | Sim | Teste de cutoff/passado congelado. |
| `tests/planningDailyBatchStock.service.test.js` | ?? | B | Sim | Sim | Teste de estoque diario em lote. |
| `tests/planningDailyTeamOverride.integration.test.js` | ?? | B | Sim | Sim | Teste de override diario de equipe. |
| `tests/planningDependencyDailyBatch.service.test.js` | ?? | B | Sim | Sim | Teste de dependencia/estoque diario. |
| `tests/planningDiagnosticDelta.service.test.js` | ?? | B | Sim | Sim | Teste de delta de diagnosticos. |
| `tests/planningManualStockPartialModal.test.js` | ?? | B | Sim | Sim | Teste REF-014 de estoque parcial. |
| `tests/planningProductionDecisions.service.test.js` | ?? | B | Sim | Sim | Teste de decisoes de producao/falta. |
| `tests/planningReoptimization.service.test.js` | ?? | B | Sim | Sim | Teste de reotimizacao. |
| `tests/planningScheduleRenderer.test.js` | ?? | B | Sim | Sim | Teste do host/foco do renderer. |
| `tests/planningScheduleViewModel.test.js` | ?? | B | Sim | Sim | Teste do read model. |
| `tests/planningStockBalanceToggle.test.js` | ?? | B | Sim | Sim | Teste de toggle de estoque. |
| `tests/planningStockProjection.service.test.js` | ?? | B | Sim | Sim | Teste de projecao de estoque. |
| `tests/planningStockProjectionModal.test.js` | ?? | B | Sim | Sim | Teste do modal de projecao de estoque. |
| `tests/productionCalendarConfigurationEdit.integration.test.js` | ?? | B | Sim | Sim | Teste integrado de edicao de configuracao no calendario. |
| `tests/productionCalendarDayHeader.test.js` | ?? | B/J | Sim | Sim | Teste REF-015 do header V2 legado. |
| `tests/productionCalendarEditButton.test.js` | ?? | B/J | Sim | Sim | Teste V2/editor temporario. |
| `tests/productionCalendarGrid.test.js` | ?? | B/J | Sim | Sim | Teste V2 grid temporario. |
| `tests/productionCalendarHorizon.test.js` | ?? | B/J | Sim | Sim | Teste V2 horizonte temporario. |
| `tests/productionCalendarMemberships.test.js` | ?? | B | Sim | Sim | Teste de memberships usados pelo calendario. |
| `tests/productionCalendarSplitEditor.test.js` | ?? | B/J | Sim | Sim | Teste de split editor ainda em pacote V2. |
| `tests/productionCalendarStage.test.js` | ?? | B/J | Sim | Sim | Teste de stage V2 temporario. |
| `tests/productionDisplayColor.test.js` | ?? | B | Sim | Sim | Teste da identidade/cor compartilhada. |
| `tests/productivityMatrixCatalog.service.test.js` | ?? | B | Sim | Sim | Teste do catalogo de matriz. |
| `tests/productivityMatrixResolution.service.test.js` | ?? | B | Sim | Sim | Teste da resolucao canonica da matriz. |
| `tmp/*` | Ignorado | F/I | Nao | Nao | Logs, PIDs e PDFs temporarios gerados por servidores/validacoes. |
| `.env` | Ignorado | G | Nao | Nao | Arquivo sensivel local; nao aberto e nao deve ser versionado. |

## 4. Arquivos nao rastreados criticos

Itens essenciais ainda fora do Git antes do checkpoint:

- `database/021_manual_transport_status.sql`
- `services/automaticSimulationBaseline.service.js`
- `services/manualScheduleDiagnosticPresenter.service.js`
- `services/manualScheduleHistory.service.js`
- `services/materialStockMetrics.service.js`
- `services/planningDiagnosticDelta.service.js`
- `services/planningReoptimization.service.js`
- `services/planningStockProjection.service.js`
- `services/productivityMatrixCatalog.service.js`
- `services/productivityMatrixResolution.service.js`
- todo `shared/planning-schedule-view/`
- `shared/production-calendar/ProductionCalendarEditor.js`
- `shared/production-calendar/ProductionCalendarSplitEditor.js`
- `shared/production-calendar/productionDisplayColor.js`
- os testes novos listados na tabela, incluindo `tests/manualScheduleAllocationSplit.service.test.js` e todos os testes REF-010 a REF-015.
- `docs/` e o Plano Mestre, pois documentam gates, baseline e decisoes.

Conclusao: ha codigo essencial ao baseline 51/51 ainda fora do Git. O gate pode ser liberado para a proxima missao somente com a condicao de criar o checkpoint manual recomendado antes de iniciar a extracao.

## 5. Arquivos sensiveis

Confirmado sem abrir nem expor conteudo:

- `.env` existe no root.
- `.env` esta protegido por `.gitignore`.
- `.env.example` e rastreado e permitido.
- `backend/.env` e `backend/.env.*` estao protegidos por `.gitignore`.
- Nenhum arquivo sensivel rastreado foi encontrado por nome/padrao em `git ls-files`.
- Nenhum certificado, chave, dump compactado, credential, secret ou token rastreado foi identificado por nome.

Nao imprimir valores foi respeitado.

## 6. Residuos e arquivos que nao devem entrar

Residuos encontrados e classificados como F/I, todos fora do checkpoint:

- `tmp/codex-server.err.log`
- `tmp/codex-server.out.log`
- `tmp/mission-8-3-server.err.log`
- `tmp/mission-8-3-server.out.log`
- `tmp/nasajon-server.err.log`
- `tmp/nasajon-server.out.log`
- `tmp/nasajon-server-3010.err.log`
- `tmp/nasajon-server-3010.out.log`
- `tmp/planejamento-1206260312PLANO03.pdf`
- `tmp/planejamento-1206260312PLANO03-final.pdf`
- `tmp/planejamento-1206260312PLANO03-final-v2.pdf`
- `tmp/server-3001.err`
- `tmp/server-3001.out`
- `tmp/server-3999.err.log`
- `tmp/server-3999.out.log`
- `tmp/validation-server.err.log`
- `tmp/validation-server.out.log`
- `tmp/validation-server.pid`
- `tmp/validation-server-3001.pid`
- `.env`

## 7. Analise do .gitignore

Cobertura confirmada:

- `.env`
- `.env.*`
- `backend/.env`
- `backend/.env.*`
- `node_modules/`
- `backend/node_modules/`
- `logs/`
- `*.log`
- `coverage/`
- `dist/`
- `build/`
- `.vite/`
- `tmp/`
- `temp/`
- `*.tmp`
- arquivos comuns de OS/editor.

Lacunas recomendadas para missao propria ou ajuste antes do checkpoint se o time quiser blindagem adicional:

- `*.pid` ja esta coberto, mas `*.out` e `*.err` nao estao cobertos genericamente; hoje estao protegidos por `tmp/`.
- PDFs temporarios fora de `tmp/` nao estao cobertos por extensao (`*.pdf`); neste projeto pode haver PDFs finais intencionais, entao nao recomendo adicionar sem decisao.
- Dumps `.sql` nao estao ignorados genericamente porque migrations legitimas usam `.sql`; dumps devem seguir nomenclatura/pasta separada e regra propria se aparecerem.

Nao alterei `.gitignore` nesta missao.

## 8. Proveniencia conhecida e incerta

Conhecida por documentos REF:

- REF-011: `tests/planningConstraintRecalculation.service.test.js` e documentacao relacionada.
- REF-012: bloco de `editDraftAllocation` em `services/manualScheduleDraft.service.js`, `tests/manualScheduleAllocationSplit.service.test.js` e documentacao relacionada.
- REF-013: `pages/PlanningPage.js`, `shared/planning-schedule-view/planningScheduleRenderer.js`, `tests/planningManualScheduleIntegration.test.js`, `tests/planningScheduleRenderer.test.js` e documentacao relacionada.
- REF-014: `tests/planningManualStockPartialModal.test.js` e documentacao relacionada.
- REF-015: `tests/productionCalendarDayHeader.test.js` e documentacao relacionada.

Preexistente ou anterior as REF, conforme REF-000/Plano Mestre:

- Grande parte das alteracoes funcionais em paginas, rotas, services, V2, Gantt APS, estoque, persistencia e CSS ja estava no worktree antes das missoes de estabilizacao.

Origem incerta:

- Alteracoes amplas em `pages/AnalysisPage.js`, `pages/ImportHistoryPage.js`, `pages/ProductionPage.js`, `pages/ProductivityMatrixPage.js`, `pages/RegistrationsPage.js`, `server/routes/actuals.routes.js`, `server/routes/stock.routes.js`, `shared/Tabs.js`, `shared/Topbar.js`, `shared/api.js`, `style.css` e partes de `shared/production-calendar/*`.

Regra adotada: nao atribuir automaticamente tudo ao Codex e nao separar commits por autoria incerta.

## 9. Riscos

- O estado funcional depende de arquivos nao rastreados; no estado final da missao sao 69, incluindo este documento de evidencia. Sem checkpoint, uma limpeza manual ou troca de branch pode perder o baseline verde.
- Um commit parcial artificial pode criar um ponto intermediario quebrado, pois services, shared, rotas e testes novos sao interdependentes.
- O V2 ainda existe como legado/fallback e seus testes devem permanecer ate o gate Gantt-only.
- REF-013 ainda depende de homologacao manual do foco Fluxo -> Gantt.
- Avisos LF -> CRLF devem ser conhecidos antes do commit.

## 10. Estrategia de checkpoint

Recomendacao: um unico commit local de checkpoint funcional, depois de revisar o staging, porque a arvore atual contem alteracoes interdependentes e o objetivo principal e restaurabilidade real, nao historico semantico perfeito.

Mensagem sugerida:

```text
checkpoint: baseline funcional antes da reestruturacao do planejamento
```

Nao incluir:

- `.env`
- `tmp/`
- logs
- PIDs
- PDFs temporarios
- qualquer dump/backup/credencial.

## 11. Comandos recomendados ao Gu

Nao executados nesta missao.

```bash
git status --short
git add -u
git add PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md
git add database/021_manual_transport_status.sql
git add docs/APS_GANTT_ARCHITECTURE.md docs/APS_GANTT_EVOLUTION_LOG.md docs/APS_GANTT_TASKS.md docs/refactor
git add services/automaticSimulationBaseline.service.js services/manualScheduleDiagnosticPresenter.service.js services/manualScheduleHistory.service.js services/materialStockMetrics.service.js services/planningDiagnosticDelta.service.js services/planningReoptimization.service.js services/planningStockProjection.service.js services/productivityMatrixCatalog.service.js services/productivityMatrixResolution.service.js
git add shared/browserCacheReset.js shared/planning-schedule-view shared/production-calendar/ProductionCalendarEditor.js shared/production-calendar/ProductionCalendarSplitEditor.js shared/production-calendar/productionDisplayColor.js
git add tests/automaticSimulationBaseline.service.test.js tests/ganttApsRenderer.test.js tests/manualScheduleAllocationSplit.service.test.js tests/manualScheduleDiagnosticPresenter.service.test.js tests/manualScheduleEditCapacityOverride.test.js tests/manualScheduleHistory.service.test.js tests/materialStockMetrics.service.test.js tests/planningConstraintRecalculation.service.test.js tests/planningCutoffSnapshot.integration.test.js tests/planningDailyBatchStock.service.test.js tests/planningDailyTeamOverride.integration.test.js tests/planningDependencyDailyBatch.service.test.js tests/planningDiagnosticDelta.service.test.js tests/planningManualStockPartialModal.test.js tests/planningProductionDecisions.service.test.js tests/planningReoptimization.service.test.js tests/planningScheduleRenderer.test.js tests/planningScheduleViewModel.test.js tests/planningStockBalanceToggle.test.js tests/planningStockProjection.service.test.js tests/planningStockProjectionModal.test.js tests/productionCalendarConfigurationEdit.integration.test.js tests/productionCalendarDayHeader.test.js tests/productionCalendarEditButton.test.js tests/productionCalendarGrid.test.js tests/productionCalendarHorizon.test.js tests/productionCalendarMemberships.test.js tests/productionCalendarSplitEditor.test.js tests/productionCalendarStage.test.js tests/productionDisplayColor.test.js tests/productivityMatrixCatalog.service.test.js tests/productivityMatrixResolution.service.test.js
git status --short
git diff --cached --stat
git diff --cached --name-status
node --test tests/*.js
git commit -m "checkpoint: baseline funcional antes da reestruturacao do planejamento"
```

Observacao: se `git status --short` mostrar `.env`, `tmp/`, PDFs temporarios, dumps ou logs no staging, interromper antes do commit e remover do staging manualmente.

## 12. Criterios do gate

| Criterio | Status | Evidencia |
|---|---|---|
| Suite esta 51/51 | OK | `node --test tests/*.js` com 51 pass, 0 fail. |
| Nenhum segredo sera versionado | OK | `.env` ignorado; nenhum sensivel rastreado identificado. |
| Todos os arquivos necessarios estao identificados | OK | Inventario completo acima. |
| Todos os testes importantes estao identificados | OK | 51 testes listados e executados. |
| Migrations necessarias estao identificadas | OK | `database/021_manual_transport_status.sql`. |
| Gantt APS atual esta identificado | OK | `shared/planning-schedule-view/gantt-aps/*` e host/read model. |
| Documentacao REF esta presente | OK | REF-000 a REF-015 presentes; REF-020 criado nesta missao. |
| Nao existe arquivo essencial perdido em temporario | OK | `tmp/` contem residuos; nada essencial identificado. |
| Estado atual pode ser restaurado por checkpoint | OK com condicao | Requer executar o checkpoint manual recomendado. |
| Escopo da primeira extracao esta definido | OK | Ver secao 14. |
| Nenhuma homologacao automatica foi falsamente marcada como manual | OK | REF-013 permanece pendente. |

## 13. Status do gate

GATE DE REFATORACAO: LIBERADO

Justificativa: baseline automatizado confirmado em 51/51, arquivos essenciais e nao rastreados foram identificados, sensiveis estao protegidos, residuos estao fora do checkpoint, documentacao REF esta presente e a primeira extracao esta delimitada. A liberacao pressupoe que o Gu crie o checkpoint manual antes de executar a primeira extracao.

## 14. Primeira extracao recomendada

Recomendacao: extrair somente formatadores e normalizadores puros de apresentacao geral da `PlanningPage.js`.

Funcoes exatas:

- `formatDateOnly` - linha aproximada 213
- `formatPeriod` - linha aproximada 329
- `parsePtBrDecimal` - linha aproximada 348
- `escapeHtml` - linha aproximada 362
- `normalizeText` - linha aproximada 371
- `normalizeJsonArray` - linha aproximada 423
- `normalizeJsonObject` - linha aproximada 434
- `formatPtBrDecimal` - linha aproximada 445
- `formatPtBrInteger` - linha aproximada 455

Nao incluir na primeira extracao:

- `normalizeOperationParentId`, porque ja entra em parentesco/identidade de operations e estoque manual.
- `normalizeShiftTimes`, porque pertence ao draft/turnos.
- helpers de estoque, transporte, material ou cor, porque cada um toca contratos produtivos ou acoplamento V2/Gantt.

Novo arquivo sugerido:

```text
shared/planning-presentation/planningFormatters.js
```

Imports necessarios:

- Nenhum import produtivo esperado; as funcoes sao puras.
- `PlanningPage.js` passaria a importar os helpers do novo modulo.

Consumidores atuais:

- `pages/PlanningPage.js` em render de periodos, labels, modais, estoque, fluxo, detalhes, PDF e tabelas.
- Testes que inspecionam strings de `PlanningPage.js`: `tests/planningStockProjectionModal.test.js` e outros testes podem precisar ajuste se procurarem chamada literal local.

Testes existentes que protegem comportamento:

- `tests/planningStockProjectionModal.test.js`
- `tests/planningManualStockPartialModal.test.js`
- `tests/planningManualScheduleIntegration.test.js`
- `tests/automaticSimulationBaseline.service.test.js` indiretamente por contratos textuais de normalizacao em rotas.
- Suite completa `node --test tests/*.js`.

Testes novos necessarios:

- Criar teste focado para `shared/planning-presentation/planningFormatters.js`, cobrindo:
  - data ISO e valor vazio em `formatDateOnly`;
  - periodo com inicio/fim ausentes;
  - decimal PT-BR com virgula e ponto;
  - fallback invalido em `parsePtBrDecimal`;
  - escape de HTML;
  - normalizacao textual minuscula/trim;
  - array/object vindos de objeto, array, JSON string valido e JSON invalido;
  - `formatPtBrDecimal` e `formatPtBrInteger`.

Risco:

- Baixo, desde que a extracao preserve assinatura e valores exatamente.
- Risco principal e teste estatico que leia a funcao dentro de `PlanningPage.js`; deve ser ajustado para importar o modulo novo em vez de procurar implementacao local.

Motivo da escolha:

- Grupo coeso, puro, sem estado, sem DOM, sem API, sem banco, sem scheduler, sem estoque canonico e sem identidade persistente.
- Reduz dependencia inicial da `PlanningPage.js` sem tocar no fluxo manual, no Gantt APS ou na persistencia.

Arquivos que a proxima missao devera tocar:

- `pages/PlanningPage.js`
- `shared/planning-presentation/planningFormatters.js`
- `shared/planning-presentation/index.js`, se o projeto preferir barrel pequeno
- teste novo em `tests/planningFormatters.test.js`
- testes estaticos existentes somente se quebrarem por import/linha local
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`
- documento REF da extracao futura

## 15. Homologacoes pendentes

- REF-013: homologacao manual do foco Fluxo Produtivo -> Gantt APS permanece pendente.
- REF-020 checkpoint: checkpoint Git manual pelo Gu permanece pendente; nenhum commit foi executado.
- Primeira extracao: nao iniciada.

## 16. Conclusao

Missao concluida. O estado funcional atual foi fotografado tecnicamente, o baseline 51/51 foi confirmado, os arquivos essenciais fora do Git foram identificados, sensiveis/residuos foram excluidos da proposta de checkpoint e o gate de refatoracao foi liberado com a condicao operacional de criar o checkpoint manual antes da primeira extracao.
