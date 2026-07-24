---
name: acofer-operational-homologation
description: Padroniza homologacao funcional do Planejamento Aco-Fer pelo fluxo real do PCP. Use quando houver mudanca visivel, calendario, movimento, split, maquina, pessoas, save, refresh, reopen, descarte, reotimizacao, estoque, validacao, UI ou correcao com risco operacional.
---

# acofer-operational-homologation

Esta skill e dona da metodologia de homologacao operacional do Planejamento Aco-Fer. Ela avalia se a entrega funciona como processo completo para o usuario de PCP.

Consumidor principal: Max Verstappen.

Consumidores secundarios: Leonardo pode usar para definir criterios funcionais; Toto pode consultar para entender fluxos operacionais que precisam de apoio tecnico; Rogerio e Leco podem acompanhar como observadores. JARVIS nao deve usar esta skill para homologar o proprio trabalho.

Fora do escopo: implementacao, correcao, criacao de testes automatizados, arquitetura, redefinicao de regra produtiva, edicao silenciosa durante homologacao e aprovacao tecnica.

## Principio central

Teste verde e evidencia tecnica, nao homologacao. A homologacao verifica o fluxo real completo e pode reprovar mesmo quando os testes tecnicos passam.

## Independencia

```text
JARVIS implementa
↓
Toto testa tecnicamente
↓
Max homologa operacionalmente
```

- JARVIS nao aprova o proprio trabalho.
- Toto nao transforma teste tecnico em homologacao.
- Max nao corrige codigo durante a homologacao.
- Falha tecnica bloqueante impede homologacao.
- Teste tecnico incompleto deve aparecer como risco.
- Homologacao pode reprovar mesmo com testes verdes.
- Homologacao nao substitui cobertura tecnica.

Esta skill pode consultar a implementacao e os testes, mas nao herda o veredito deles.

## Fontes reais

- `AGENTS.md`: escopo do projeto, coordenacao de agents e fronteiras gerais.
- `CALENDAR_V2_ARCHITECTURE.md`: mapa normativo do Calendario V2; confirme sempre no codigo atual.
- Skills de dominio relacionadas, carregadas somente conforme o fluxo: `$acofer-manual-calendar`, `$acofer-persistence-legacy`, `$acofer-stock`, `$acofer-validation-diagnostics`, `$acofer-reoptimization`, `$acofer-production-calendar-ui`, `$acofer-investigation`, `$acofer-testing`.
- Paginas e componentes afetados: `pages/PlanningPage.js` e `shared/production-calendar/*` quando houver calendario, UI ou callbacks.
- Routes e services envolvidos: `server/routes/planning.routes.js`, `services/manualScheduleDraft.service.js`, `services/manualScheduleTransaction.service.js`, `services/manualSchedulePersistence.service.js`, `services/manualScheduleValidation.service.js`, `services/manualScheduleResourceValidation.service.js`, `services/manualScheduleStockLedger.service.js`, `services/planningReoptimization.service.js`, `services/planningStockProjection.service.js`, `services/materialStockMetrics.service.js`, `services/productivityMatrixResolution.service.js`.
- Testes tecnicos executados pelo Toto: comandos reais registrados a partir de `node tests/<arquivo>.js`, `node --test tests/*.js`, `npm run db:schema` ou `npm run db:validate` quando aplicaveis.
- Comportamento real no browser, backend e banco quando necessarios ao fluxo. Nao use browser quando a tarefa proibir.

## Preparacao

Antes de homologar:

- Ler o requisito original.
- Identificar o comportamento anterior.
- Identificar o comportamento esperado.
- Listar dados de teste.
- Listar pre-condicoes.
- Verificar se a implementacao esta disponivel no ambiente.
- Consultar resultados tecnicos do Toto.
- Carregar somente as skills de dominio relevantes.

## Fluxo-base

Quando aplicavel, execute:

```text
abrir planejamento
→ carregar calendario
→ executar acao
→ observar resultado imediato
→ salvar
→ atualizar a pagina
→ reabrir
→ confirmar persistencia
→ executar acao relacionada
→ verificar estoque/precedencia/recursos
→ conferir console/backend
→ emitir veredito
```

## Areas de verificacao

### Calendario manual

- Allocation correta.
- Identidade preservada.
- Move.
- Split.
- Merge/replace quando aplicavel.
- Maquina.
- Pessoas.
- Produtividade.
- Datas.
- Horarios.
- Rollback visivel em erro.

### Persistencia

- Save.
- Refresh.
- Reopen.
- Revisao.
- Conflito.
- Descarte.
- Dados legados, quando aplicavel.

### Estoque

- Saldo antes.
- Consumo.
- Entrada.
- Disponibilidade.
- Piso zero.
- Projecao.
- Efeitos apos salvar e reabrir.

### Reotimizacao

- Passado congelado.
- Cutoff.
- Futuro recalculado.
- Decisoes manuais preservadas.
- Sabado/datas liberadas.
- Equipe.
- Recursos.
- Ausencia de reotimizacao global indevida.

### Validacao

- Erro bloqueia quando deve.
- Warning nao bloqueia indevidamente.
- Diagnostico exibido corretamente.
- UI nao esconde falha.
- Nenhuma acao invalida e persistida.

### UI

- Cards.
- Grid.
- Drag.
- Toolbar.
- Zoom.
- Fullscreen.
- Modal.
- Scroll.
- Responsividade relevante.
- Ausencia de erro no console.

## Regras

- Nao corrigir codigo durante homologacao.
- Nao alterar arquivo.
- Nao declarar sucesso sem executar o fluxo.
- Nao considerar apenas screenshot.
- Nao considerar apenas teste automatizado.
- Registrar pre-condicao e resultado.
- Usar dados representativos.
- Repetir fluxo apos refresh quando houver persistencia.
- Verificar efeitos colaterais diretamente relacionados.
- Nao expandir para todo o sistema sem necessidade.
- Interromper e reprovar diante de bloqueio critico.
- Registrar limitacoes ambientais.

## Skills relacionadas

- Carregue `$acofer-manual-calendar` para move, split, merge, replace, transacao, rollback, identidade e conservacao.
- Carregue `$acofer-persistence-legacy` para save, refresh, reopen, discard, revision, 409, hash e legado.
- Carregue `$acofer-stock` para saldo, consumo, entrada, disponibilidade, minimo, piso zero e projecao.
- Carregue `$acofer-validation-diagnostics` para erro, warning, bloqueio, capacidade, equipe, turnos, dependencias, transporte, setup e diagnosticos.
- Carregue `$acofer-reoptimization` para cutoff, passado congelado, futuro restante, candidato, delta e decisoes manuais.
- Carregue `$acofer-production-calendar-ui` para grid, cards, drag, toolbar, zoom, fullscreen, modais, scroll e responsividade.
- Carregue `$acofer-investigation` quando houver divergencia sem causa raiz.
- Carregue `$acofer-testing` para consultar evidencias tecnicas, sem herdar veredito operacional.

## Evidencias obrigatorias

Retorne:

- `Skills usadas`.
- Requisito homologado.
- Ambiente.
- Dados utilizados.
- Passos executados.
- Resultado por passo.
- Testes tecnicos consultados.
- Console.
- Backend.
- Banco, quando aplicavel.
- Divergencias.
- Limitacoes.
- Bloqueadores.
- Veredito.

## Vereditos operacionais

Use exclusivamente:

- `Homologado`.
- `Homologado com restricoes`.
- `Reprovado`.
- `Nao homologado por limitacao ambiental`.

Nunca use `Aprovado tecnicamente` como veredito operacional.
