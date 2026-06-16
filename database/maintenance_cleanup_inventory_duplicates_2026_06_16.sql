BEGIN;

WITH before_totals AS (
  SELECT
    (SELECT COUNT(*)::int FROM inventory_counts) AS inventory_counts_before,
    (SELECT COUNT(*)::int FROM inventory_count_items) AS inventory_count_items_before
),
candidates AS (
  SELECT
    c.id,
    c.created_at,
    COUNT(i.id)::int AS item_count
  FROM inventory_counts c
  LEFT JOIN inventory_count_items i ON i.inventory_count_id = c.id
  WHERE c.created_at >= '2026-06-16T00:00:00-03:00'::timestamptz
    AND c.created_at < '2026-06-17T00:00:00-03:00'::timestamptz
  GROUP BY c.id
),
keep_count AS (
  SELECT id
  FROM candidates
  ORDER BY item_count DESC, created_at DESC, id DESC
  LIMIT 1
),
delete_counts AS (
  SELECT id
  FROM candidates
  WHERE id <> (SELECT id FROM keep_count)
),
deleted_items AS (
  DELETE FROM inventory_count_items
  WHERE inventory_count_id IN (SELECT id FROM delete_counts)
  RETURNING id
),
deleted_counts AS (
  DELETE FROM inventory_counts
  WHERE id IN (SELECT id FROM delete_counts)
  RETURNING id
),
after_totals AS (
  SELECT
    (SELECT COUNT(*)::int FROM inventory_counts) AS inventory_counts_after,
    (SELECT COUNT(*)::int FROM inventory_count_items) AS inventory_count_items_after
)
SELECT
  before_totals.inventory_counts_before,
  before_totals.inventory_count_items_before,
  (SELECT id FROM keep_count) AS kept_inventory_count_id,
  COALESCE((SELECT array_agg(id ORDER BY id) FROM deleted_counts), ARRAY[]::bigint[]) AS deleted_inventory_count_ids,
  after_totals.inventory_counts_after,
  after_totals.inventory_count_items_after
FROM before_totals, after_totals;

COMMIT;
