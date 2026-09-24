/*
  Limpa o histórico antigo de inventários.

  inventory_count_items é removido automaticamente
  por ON DELETE CASCADE.
*/

BEGIN;

DELETE FROM inventory_counts;

COMMIT;