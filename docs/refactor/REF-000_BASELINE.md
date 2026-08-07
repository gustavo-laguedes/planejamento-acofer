# REF-000 - Baseline seguro

Data: 2026-08-06
Modo: auditoria/leitura, sem alteracao de codigo produtivo.

## Git

- Branch: `rebuild-production-calendar`
- Commit: `73b261a5f10a2c33e29995e0bdc6c18190c15a40`
- Estado: arvore com alteracoes nao commitadas e muitos arquivos nao rastreados.
- `git status --short`: confirmou modificacoes em documentacao, paginas, services, rotas, shared e testes; confirmou `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`, `docs/`, `shared/planning-schedule-view/`, novos services e muitos testes como nao rastreados.
- `git diff --stat`: 41 arquivos rastreados modificados, 11191 insercoes e 1214 delecoes. Avisos de LF -> CRLF em arquivos rastreados.

## Arquivos modificados rastreados principais

- `CALENDAR_V2_ARCHITECTURE.md`
- `pages/AnalysisPage.js`
- `pages/ImportHistoryPage.js`
- `pages/PlanningPage.js`
- `server/routes/planning.routes.js`
- `services/manualScheduleDraft.service.js`
- `services/manualScheduleTransaction.service.js`
- `services/planning.service.js`
- `shared/production-calendar/*`
- `style.css`
- testes de calendario/manual/persistencia

## Arquivos nao rastreados relevantes

- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`
- `docs/APS_GANTT_ARCHITECTURE.md`
- `docs/APS_GANTT_TASKS.md`
- `docs/APS_GANTT_EVOLUTION_LOG.md`
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
- `shared/planning-schedule-view/`
- `shared/production-calendar/ProductionCalendarEditor.js`
- `shared/production-calendar/ProductionCalendarSplitEditor.js`
- `shared/production-calendar/productionDisplayColor.js`
- novos testes em `tests/*`

## Ambiente

- Node.js: `v24.16.0`
- Scripts em `package.json`: `start`, `dev`, `db:schema`, `db:validate`
- Inicializacao minima: `npm run dev` ou `npm start`
- Banco: `npm run db:schema` e `npm run db:validate` dependem de `DATABASE_URL`

## Baseline de testes

Comando solicitado: `node --test tests/*.js`

Primeira tentativa no sandbox: falhou com `spawn EPERM` nos 39 arquivos de teste descobertos pelo runner. Classificacao: bloqueio ambiental do sandbox para subprocessos.

Reteste autorizado fora do sandbox: 51 testes, 45 aprovados, 6 falhos.

Falhas:

- `tests/manualScheduleAllocationSplit.service.test.js`: `edicao localizada mantem quantidade, linhagem e parte irma`, esperado `42.35`, atual `30.25`.
- `tests/planningConstraintRecalculation.service.test.js`: erro `Producoes anteriores a hoje sao somente leitura.`
- `tests/planningManualScheduleIntegration.test.js`: assertion `harness do movimento manual deve existir`.
- `tests/planningManualStockPartialModal.test.js`: teste estatico capturou trecho com `simulateCurrent`/reotimizacao fora do alvo pretendido.
- `tests/planningScheduleRenderer.test.js`: regex de foco `planningScheduleRendererHost?.focusAllocation(allocation.allocationId)` nao encontrada no trecho extraido.
- `tests/productionCalendarDayHeader.test.js`: fake DOM sem `querySelector` para chamada atual de `ProductionCalendarGrid`.

Diferenca contra baseline documentado: nenhuma no total funcional fora do sandbox; o resultado atual repete 51/45/6. A diferenca nova e a primeira tentativa ambiental `spawn EPERM`.

## Arquivos sensiveis

- Encontrados no root: `.env` e `.env.example`.
- `.env` nao foi aberto e nenhum valor foi registrado.
- Busca textual registrou apenas nomes de variaveis e referencias de codigo, sem copiar segredos.

## Checkpoint recomendado

Nao foi criado commit nem backup automatico. Recomendacao manual ao Gu antes de qualquer refatoracao:

```bash
git status --short > baseline-git-status.txt
git diff --stat > baseline-git-diff-stat.txt
```

Para fotografia recuperavel sem expor `.env`, criar backup externo da pasta do projeto excluindo `.git`, `node_modules` e `.env`, ou criar um commit/checkpoint local somente depois de revisar os arquivos nao rastreados que devem entrar.

