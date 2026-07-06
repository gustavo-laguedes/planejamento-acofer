/*
  Planejamento Aco-Fer - limpeza operacional segura

  Escopo destrutivo SOMENTE operacional:
    - production_plan_days: dias/itens/eventos de planejamento salvos.
    - production_plans: planejamentos criados/salvos, arvore e operacoes.
    - production_actuals: apontamentos/producao realizada.
    - production_launches: lancamentos de producao e solicitacoes de cancelamento
      ou notificacoes operacionais derivadas desses lancamentos.
    - inventory_count_items: itens de inventarios realizados.
    - inventory_counts: inventarios realizados.
    - stock_import_material_balances: saldos consolidados por material vindos do CSV.
    - stock_snapshot: snapshots/linhas importadas do CSV.
    - stock_adjustments: ajustes operacionais do estoque importado.
    - stock_location_adjustments: saldos/conferencias operacionais por local.
    - stock_material_corrections: correcoes operacionais por material.
    - import_history: historico, arquivo e registro da ultima importacao CSV.

  Preservar obrigatoriamente:
    - materials, material_inputs, locations, machines, productivity_matrix.
    - app_users e usuarios/autenticacao externa.
    - permissoes/RBAC em codigo e parametros fixos do sistema.
    - audit_logs.
    - schema, migrations, indices e constraints.

  Para testar sem persistir, troque o COMMIT final por ROLLBACK.
  Nao executar em producao sem confirmacao explicita.
*/

BEGIN;

CREATE TEMP TABLE cleanup_operational_before AS
SELECT *
FROM (
  VALUES
    ('production_plan_days', (SELECT COUNT(*)::bigint FROM production_plan_days), 'APAGAR', 'Dias/itens/eventos de planejamento salvos.'),
    ('production_plans', (SELECT COUNT(*)::bigint FROM production_plans), 'APAGAR', 'Planejamentos criados/salvos, arvore e operacoes.'),
    ('production_actuals', (SELECT COUNT(*)::bigint FROM production_actuals), 'APAGAR', 'Apontamentos/producao realizada.'),
    ('production_launches', (SELECT COUNT(*)::bigint FROM production_launches), 'APAGAR', 'Lancamentos de producao e cancelamentos/notificacoes operacionais derivadas.'),
    ('inventory_count_items', (SELECT COUNT(*)::bigint FROM inventory_count_items), 'APAGAR', 'Itens de inventarios realizados.'),
    ('inventory_counts', (SELECT COUNT(*)::bigint FROM inventory_counts), 'APAGAR', 'Inventarios realizados.'),
    ('stock_import_material_balances', (SELECT COUNT(*)::bigint FROM stock_import_material_balances), 'APAGAR', 'Saldos consolidados por material vindos do CSV.'),
    ('stock_snapshot', (SELECT COUNT(*)::bigint FROM stock_snapshot), 'APAGAR', 'Snapshots/linhas importadas do CSV.'),
    ('stock_adjustments', (SELECT COUNT(*)::bigint FROM stock_adjustments), 'APAGAR', 'Ajustes operacionais do estoque importado.'),
    ('stock_location_adjustments', (SELECT COUNT(*)::bigint FROM stock_location_adjustments), 'APAGAR', 'Saldos/conferencias operacionais por local.'),
    ('stock_material_corrections', (SELECT COUNT(*)::bigint FROM stock_material_corrections), 'APAGAR', 'Correcoes operacionais por material.'),
    ('import_history', (SELECT COUNT(*)::bigint FROM import_history), 'APAGAR', 'Historico, arquivo e registro da ultima importacao CSV.'),
    ('materials', (SELECT COUNT(*)::bigint FROM materials), 'PRESERVAR', 'Cadastro de materiais.'),
    ('material_inputs', (SELECT COUNT(*)::bigint FROM material_inputs), 'PRESERVAR', 'Insumos/modelos produtivos cadastrados.'),
    ('locations', (SELECT COUNT(*)::bigint FROM locations), 'PRESERVAR', 'Cadastro de locais.'),
    ('machines', (SELECT COUNT(*)::bigint FROM machines), 'PRESERVAR', 'Cadastro de maquinas.'),
    ('productivity_matrix', (SELECT COUNT(*)::bigint FROM productivity_matrix), 'PRESERVAR', 'Matriz de produtividade.'),
    ('app_users', (SELECT COUNT(*)::bigint FROM app_users), 'PRESERVAR', 'Usuarios e permissoes do aplicativo.'),
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
