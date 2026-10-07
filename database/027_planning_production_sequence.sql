CREATE TABLE IF NOT EXISTS planning_production_sequence (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

INSERT INTO planning_production_sequence (
  id,
  last_number
)
VALUES (
  1,
  0
)
ON CONFLICT (id) DO NOTHING;


/*
 * Compatibilidade com planejamentos que já existiam
 * antes da criação do sequencial global.
 *
 * Cada planejamento antigo contribui com a quantidade
 * de produções que já possuía.
 *
 * Ex.:
 *
 * plano antigo com #1, #2 e #3
 * => last_number passa a 3.
 */
WITH historical AS (
  SELECT
    COALESCE(
      SUM(
        CASE
          WHEN
            jsonb_typeof(
              (operations -> 0)
              -> '_planningMeta'
              -> 'productions'
            ) = 'array'
          THEN
            jsonb_array_length(
              (operations -> 0)
              -> '_planningMeta'
              -> 'productions'
            )

          WHEN
            jsonb_typeof(schedule_tree) = 'object'
            AND
            jsonb_typeof(
              schedule_tree -> 'children'
            ) = 'array'
            AND
            LOWER(
              COALESCE(
                schedule_tree ->> 'materialName',
                ''
              )
            ) IN (
              'plano de produção',
              'plano de producao'
            )
          THEN
            jsonb_array_length(
              schedule_tree -> 'children'
            )

          ELSE 1
        END
      ),
      0
    )::INTEGER AS production_count

  FROM production_plans
)

UPDATE planning_production_sequence sequence
SET last_number =
  GREATEST(
    sequence.last_number,
    historical.production_count
  )
FROM historical
WHERE sequence.id = 1;
