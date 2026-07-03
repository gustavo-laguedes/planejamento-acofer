/*
  Planejamento Aco-Fer - limpeza completa da base de demonstracao

  Escopo:
  - APAGAR dados operacionais:
    - production_plan_days: calendario/cronograma gerado pelos planejamentos.
    - production_plans: planejamentos, historico, schedule_tree e operations.
    - production_actuals: apontamentos/realizado.
    - production_launches: lancamentos de producao e dados derivados em JSON.
    - inventory_count_items: itens/conferencias dos inventarios.
    - inventory_counts: historico/registros de inventario.
    - stock_import_material_balances: saldos derivados das importacoes CSV.
    - stock_snapshot: estoque importado via CSV.
    - stock_adjustments: ajustes operacionais de estoque importado.
    - stock_location_adjustments: saldos/conferencias operacionais por local.
    - stock_material_corrections: correcoes operacionais por material.
    - import_history: historico, arquivos e ultima importacao CSV.

  - PRESERVAR:
    - cadastros e estrutura: materials, material_inputs, locations, machines,
      productivity_matrix.
    - usuarios, permissoes e autenticacao: app_users, users, Clerk externo.
    - auditoria: audit_logs.
    - migrations, tabelas, indices, constraints e demais objetos de schema.

  Relacoes/FKs relevantes:
  - production_plan_days.plan_id -> production_plans.id ON DELETE CASCADE.
  - inventory_count_items.inventory_count_id -> inventory_counts.id ON DELETE CASCADE.
  - stock_snapshot.import_id -> import_history.id ON DELETE SET NULL.
  - stock_import_material_balances.import_id -> import_history.id ON DELETE CASCADE.

  Para testar sem persistir, troque o COMMIT final por ROLLBACK.
  Nao usa DROP TABLE e nao altera estrutura.
*/

BEGIN;

CREATE TEMP TABLE cleanup_operational_before AS
SELECT *
FROM (
  VALUES
    ('production_plan_days', (SELECT COUNT(*)::bigint FROM production_plan_days), 'APAGAR', 'Calendario/cronograma gerado pelos planejamentos.'),
    ('production_plans', (SELECT COUNT(*)::bigint FROM production_plans), 'APAGAR', 'Planejamentos, historico, schedule_tree e operations.'),
    ('production_actuals', (SELECT COUNT(*)::bigint FROM production_actuals), 'APAGAR', 'Apontamentos de producao/realizado.'),
    ('production_launches', (SELECT COUNT(*)::bigint FROM production_launches), 'APAGAR', 'Lancamentos de producao e dados derivados dos lancamentos.'),
    ('inventory_count_items', (SELECT COUNT(*)::bigint FROM inventory_count_items), 'APAGAR', 'Itens/conferencias dos inventarios fisicos.'),
    ('inventory_counts', (SELECT COUNT(*)::bigint FROM inventory_counts), 'APAGAR', 'Historico/registros de inventario fisico.'),
    ('stock_import_material_balances', (SELECT COUNT(*)::bigint FROM stock_import_material_balances), 'APAGAR', 'Saldos derivados das importacoes CSV.'),
    ('stock_snapshot', (SELECT COUNT(*)::bigint FROM stock_snapshot), 'APAGAR', 'Estoque importado via CSV.'),
    ('stock_adjustments', (SELECT COUNT(*)::bigint FROM stock_adjustments), 'APAGAR', 'Ajustes operacionais de estoque importado.'),
    ('stock_location_adjustments', (SELECT COUNT(*)::bigint FROM stock_location_adjustments), 'APAGAR', 'Saldos/conferencias operacionais por local.'),
    ('stock_material_corrections', (SELECT COUNT(*)::bigint FROM stock_material_corrections), 'APAGAR', 'Correcoes operacionais por material.'),
    ('import_history', (SELECT COUNT(*)::bigint FROM import_history), 'APAGAR', 'Historico, arquivos e ultima importacao CSV.'),
    ('materials', (SELECT COUNT(*)::bigint FROM materials), 'PRESERVAR', 'Cadastro de materiais.'),
    ('material_inputs', (SELECT COUNT(*)::bigint FROM material_inputs), 'PRESERVAR', 'Estrutura/modelos de producao dos materiais.'),
    ('locations', (SELECT COUNT(*)::bigint FROM locations), 'PRESERVAR', 'Cadastro de locais.'),
    ('machines', (SELECT COUNT(*)::bigint FROM machines), 'PRESERVAR', 'Cadastro de maquinas.'),
    ('productivity_matrix', (SELECT COUNT(*)::bigint FROM productivity_matrix), 'PRESERVAR', 'Matriz de produtividade.'),
    ('app_users', (SELECT COUNT(*)::bigint FROM app_users), 'PRESERVAR', 'Usuarios/permissoes.'),
    ('audit_logs', (SELECT COUNT(*)::bigint FROM audit_logs), 'PRESERVAR', 'Auditoria preservada.')
) AS snapshot(table_name, row_count_before, action, reason);

SELECT
  table_name,
  row_count_before AS registros_antes,
  action AS acao,
  reason AS motivo
FROM cleanup_operational_before
ORDER BY
  CASE action WHEN 'APAGAR' THEN 0 ELSE 1 END,
  table_name;

TRUNCATE TABLE
  production_plan_days,
  production_plans,
  production_actuals,
  production_launches,
  inventory_count_items,
  inventory_counts,
  stock_import_material_balances,
  stock_snapshot,
  stock_adjustments,
  stock_location_adjustments,
  stock_material_corrections,
  import_history
RESTART IDENTITY;

SELECT *
FROM (
  VALUES
    ('production_plan_days', (SELECT COUNT(*)::bigint FROM production_plan_days), 'Deve ficar 0.'),
    ('production_plans', (SELECT COUNT(*)::bigint FROM production_plans), 'Deve ficar 0.'),
    ('production_actuals', (SELECT COUNT(*)::bigint FROM production_actuals), 'Deve ficar 0.'),
    ('production_launches', (SELECT COUNT(*)::bigint FROM production_launches), 'Deve ficar 0.'),
    ('inventory_count_items', (SELECT COUNT(*)::bigint FROM inventory_count_items), 'Deve ficar 0.'),
    ('inventory_counts', (SELECT COUNT(*)::bigint FROM inventory_counts), 'Deve ficar 0.'),
    ('stock_import_material_balances', (SELECT COUNT(*)::bigint FROM stock_import_material_balances), 'Deve ficar 0.'),
    ('stock_snapshot', (SELECT COUNT(*)::bigint FROM stock_snapshot), 'Deve ficar 0.'),
    ('stock_adjustments', (SELECT COUNT(*)::bigint FROM stock_adjustments), 'Deve ficar 0.'),
    ('stock_location_adjustments', (SELECT COUNT(*)::bigint FROM stock_location_adjustments), 'Deve ficar 0.'),
    ('stock_material_corrections', (SELECT COUNT(*)::bigint FROM stock_material_corrections), 'Deve ficar 0.'),
    ('import_history', (SELECT COUNT(*)::bigint FROM import_history), 'Deve ficar 0.')
) AS validation(table_name, registros_depois, validacao)
ORDER BY table_name;

SELECT
  before.table_name,
  before.row_count_before AS registros_antes,
  after_counts.row_count_after AS registros_depois,
  CASE
    WHEN before.row_count_before = after_counts.row_count_after THEN 'OK - preservada'
    ELSE 'ATENCAO - contagem mudou'
  END AS validacao,
  before.reason AS motivo
FROM cleanup_operational_before before
JOIN LATERAL (
  SELECT CASE before.table_name
    WHEN 'materials' THEN (SELECT COUNT(*)::bigint FROM materials)
    WHEN 'material_inputs' THEN (SELECT COUNT(*)::bigint FROM material_inputs)
    WHEN 'locations' THEN (SELECT COUNT(*)::bigint FROM locations)
    WHEN 'machines' THEN (SELECT COUNT(*)::bigint FROM machines)
    WHEN 'productivity_matrix' THEN (SELECT COUNT(*)::bigint FROM productivity_matrix)
    WHEN 'app_users' THEN (SELECT COUNT(*)::bigint FROM app_users)
    WHEN 'audit_logs' THEN (SELECT COUNT(*)::bigint FROM audit_logs)
  END AS row_count_after
) after_counts ON true
WHERE before.action = 'PRESERVAR'
ORDER BY before.table_name;

-- ROLLBACK;
COMMIT;
