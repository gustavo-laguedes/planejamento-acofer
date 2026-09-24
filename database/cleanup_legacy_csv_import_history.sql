/*
  Limpa o histórico de importações para iniciar a nova sistemática.

  IMPORTANTE:
  stock_snapshot é PRESERVADO para manter o Estoque antigo
  disponível em Restrito.

  Ao apagar import_history:
  - stock_import_sales_history é removido por CASCADE
  - stock_import_material_balances é removido por CASCADE
  - stock_snapshot permanece e apenas perde o import_id antigo
*/

BEGIN;

DELETE FROM import_history;

COMMIT;