ALTER TABLE production_launches
  ADD COLUMN IF NOT EXISTS quality_norm_id BIGINT REFERENCES quality_norms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quality_norm_name TEXT,
  ADD COLUMN IF NOT EXISTS quality_length_m NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS quality_total_length_m NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS quality_real_weight_kg NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS quality_nominal_weight_per_meter NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS quality_minimum_weight_per_meter NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS quality_maximum_weight_per_meter NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS quality_actual_weight_per_meter NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS quality_deviation_from_nominal NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS quality_deviation_percent NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS quality_limit_difference NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS quality_status TEXT,
  ADD COLUMN IF NOT EXISTS quality_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS quality_evaluated_at TIMESTAMPTZ;


CREATE INDEX IF NOT EXISTS idx_production_launches_quality_status_date
  ON production_launches (
    quality_status,
    production_date
  )
  WHERE quality_status IS NOT NULL;


CREATE OR REPLACE FUNCTION production_quality_snapshot_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_requires_length BOOLEAN := false;

  v_length_m NUMERIC;
  v_material_type_id BIGINT;
  v_material_type_name TEXT;

  v_norm_id BIGINT;
  v_norm_name TEXT;

  v_nominal NUMERIC;
  v_minimum NUMERIC;
  v_maximum NUMERIC;

  v_lot JSONB;

  v_quantity NUMERIC;
  v_real_weight NUMERIC;
  v_weight_unit TEXT;

  v_lot_length NUMERIC;
  v_actual NUMERIC;
  v_deviation NUMERIC;
  v_deviation_percent NUMERIC;
  v_limit_difference NUMERIC;
  v_lot_status TEXT;

  v_total_quantity NUMERIC := 0;
  v_total_length NUMERIC := 0;
  v_total_weight NUMERIC := 0;

  v_total_actual NUMERIC;
  v_total_deviation NUMERIC;
  v_total_deviation_percent NUMERIC;
  v_total_limit_difference NUMERIC;

  v_has_compliant BOOLEAN := false;
  v_has_below BOOLEAN := false;
  v_has_above BOOLEAN := false;

  v_status TEXT;

  v_lots_snapshot JSONB := '[]'::jsonb;
  v_snapshot JSONB;

  v_compliant_lots INTEGER := 0;
  v_non_compliant_lots INTEGER := 0;

  v_use_old_snapshot BOOLEAN := false;
BEGIN

  /*
   * Quando estamos EDITANDO uma produção que já possui
   * snapshot e o material continua o mesmo,
   * preservamos os parâmetros históricos.
   *
   * Dessa forma, uma mudança futura na Norma,
   * no comprimento ou no cadastro do material
   * NÃO altera retroativamente a produção antiga.
   */
  IF TG_OP = 'UPDATE' THEN

    v_use_old_snapshot :=
      OLD.material_id IS NOT DISTINCT FROM NEW.material_id
      AND OLD.quality_norm_name IS NOT NULL
      AND COALESCE(
            OLD.quality_nominal_weight_per_meter,
            0
          ) > 0
      AND COALESCE(
            OLD.quality_minimum_weight_per_meter,
            0
          ) > 0
      AND COALESCE(
            OLD.quality_maximum_weight_per_meter,
            0
          ) > 0
      AND COALESCE(
            OLD.quality_length_m,
            0
          ) > 0;

  END IF;


  IF v_use_old_snapshot THEN

    v_norm_id :=
      OLD.quality_norm_id;

    v_norm_name :=
      OLD.quality_norm_name;

    v_nominal :=
      OLD.quality_nominal_weight_per_meter;

    v_minimum :=
      OLD.quality_minimum_weight_per_meter;

    v_maximum :=
      OLD.quality_maximum_weight_per_meter;

    v_length_m :=
      OLD.quality_length_m;

    v_material_type_id :=
      NULLIF(
        OLD.quality_snapshot
          #>>
        '{material,typeId}',
        ''
      )::BIGINT;

    v_material_type_name :=
      OLD.quality_snapshot
        #>>
      '{material,typeName}';

  ELSE

    /*
     * Verifica o Tipo de Material e o comprimento
     * cadastrados atualmente.
     */
    SELECT
      mt.requires_length,
      m.length_m,
      mt.id,
      mt.name

    INTO
      v_requires_length,
      v_length_m,
      v_material_type_id,
      v_material_type_name

    FROM materials m

    LEFT JOIN material_types mt
      ON mt.id =
        m.material_type_id

    WHERE m.id =
      NEW.material_id

    LIMIT 1;


    /*
     * Somente materiais configurados para exigir
     * comprimento entram na análise.
     *
     * Atualmente:
     * Vareta
     * Barra
     */
    IF
      COALESCE(
        v_requires_length,
        false
      ) = false

      OR

      COALESCE(
        v_length_m,
        0
      ) <= 0
    THEN

      NEW.quality_norm_id := NULL;
      NEW.quality_norm_name := NULL;
      NEW.quality_length_m := NULL;
      NEW.quality_total_length_m := NULL;
      NEW.quality_real_weight_kg := NULL;

      NEW.quality_nominal_weight_per_meter := NULL;
      NEW.quality_minimum_weight_per_meter := NULL;
      NEW.quality_maximum_weight_per_meter := NULL;

      NEW.quality_actual_weight_per_meter := NULL;
      NEW.quality_deviation_from_nominal := NULL;
      NEW.quality_deviation_percent := NULL;
      NEW.quality_limit_difference := NULL;

      NEW.quality_status := NULL;
      NEW.quality_snapshot := NULL;
      NEW.quality_evaluated_at := NULL;

      RETURN NEW;

    END IF;


    /*
     * Busca a Norma ativa vinculada ao material.
     *
     * Caso exista mais de uma Norma ativa para o material,
     * utiliza a mais recentemente atualizada.
     */
    SELECT
      n.id,
      n.name,

      qnm.nominal_weight_per_meter,
      qnm.minimum_weight_per_meter,
      qnm.maximum_weight_per_meter

    INTO
      v_norm_id,
      v_norm_name,
      v_nominal,
      v_minimum,
      v_maximum

    FROM quality_norm_materials qnm

    JOIN quality_norms n
      ON n.id =
        qnm.norm_id

    WHERE
      qnm.material_id =
        NEW.material_id

      AND
      n.active = true

    ORDER BY
      n.updated_at DESC,
      n.id DESC

    LIMIT 1;


    /*
     * Se não houver Norma válida configurada,
     * não inventar análise.
     */
    IF
      v_norm_name IS NULL

      OR

      COALESCE(
        v_nominal,
        0
      ) <= 0

      OR

      COALESCE(
        v_minimum,
        0
      ) <= 0

      OR

      COALESCE(
        v_maximum,
        0
      ) <= 0
    THEN

      NEW.quality_norm_id := NULL;
      NEW.quality_norm_name := NULL;
      NEW.quality_length_m := NULL;
      NEW.quality_total_length_m := NULL;
      NEW.quality_real_weight_kg := NULL;

      NEW.quality_nominal_weight_per_meter := NULL;
      NEW.quality_minimum_weight_per_meter := NULL;
      NEW.quality_maximum_weight_per_meter := NULL;

      NEW.quality_actual_weight_per_meter := NULL;
      NEW.quality_deviation_from_nominal := NULL;
      NEW.quality_deviation_percent := NULL;
      NEW.quality_limit_difference := NULL;

      NEW.quality_status := NULL;
      NEW.quality_snapshot := NULL;
      NEW.quality_evaluated_at := NULL;

      RETURN NEW;

    END IF;

  END IF;


  /*
   * Não analisar lançamento sem lotes válidos.
   */
  IF
    NEW.produced_lots IS NULL

    OR

    jsonb_typeof(
      NEW.produced_lots
    ) <> 'array'

    OR

    jsonb_array_length(
      NEW.produced_lots
    ) = 0
  THEN

    NEW.quality_norm_id := NULL;
    NEW.quality_norm_name := NULL;
    NEW.quality_length_m := NULL;
    NEW.quality_total_length_m := NULL;
    NEW.quality_real_weight_kg := NULL;

    NEW.quality_nominal_weight_per_meter := NULL;
    NEW.quality_minimum_weight_per_meter := NULL;
    NEW.quality_maximum_weight_per_meter := NULL;

    NEW.quality_actual_weight_per_meter := NULL;
    NEW.quality_deviation_from_nominal := NULL;
    NEW.quality_deviation_percent := NULL;
    NEW.quality_limit_difference := NULL;

    NEW.quality_status := NULL;
    NEW.quality_snapshot := NULL;
    NEW.quality_evaluated_at := NULL;

    RETURN NEW;

  END IF;


  /*
   * Calcula cada lote individualmente.
   *
   * Fórmula:
   *
   * metros produzidos =
   * quantidade x comprimento cadastrado
   *
   * kg/m real =
   * peso real / metros produzidos
   */
  FOR v_lot IN

    SELECT value
    FROM jsonb_array_elements(
      NEW.produced_lots
    )

  LOOP

    v_quantity :=
      COALESCE(
        NULLIF(
          TRIM(
            v_lot
              ->>
            'quantity'
          ),
          ''
        )::NUMERIC,
        0
      );


    v_real_weight :=
      COALESCE(

        NULLIF(
          TRIM(
            v_lot
              ->>
            'realWeight'
          ),
          ''
        )::NUMERIC,

        NULLIF(
          TRIM(
            v_lot
              ->>
            'real_weight'
          ),
          ''
        )::NUMERIC,

        0
      );


    v_weight_unit :=
      LOWER(
        TRIM(
          COALESCE(

            NULLIF(
              v_lot
                ->>
              'realWeightUnit',
              ''
            ),

            NULLIF(
              v_lot
                ->>
              'real_weight_unit',
              ''
            ),

            NULLIF(
              v_lot
                ->>
              'secondaryUnit',
              ''
            ),

            NULLIF(
              v_lot
                ->>
              'secondary_unit',
              ''
            ),

            ''
          )
        )
      );


    /*
     * Para este cálculo o peso real precisa estar em kg.
     *
     * Se algum lote não puder ser analisado com segurança,
     * não gerar um snapshot parcial.
     */
    IF
      v_quantity <= 0

      OR

      v_real_weight <= 0

      OR

      v_weight_unit <> 'kg'
    THEN

      NEW.quality_norm_id := NULL;
      NEW.quality_norm_name := NULL;
      NEW.quality_length_m := NULL;
      NEW.quality_total_length_m := NULL;
      NEW.quality_real_weight_kg := NULL;

      NEW.quality_nominal_weight_per_meter := NULL;
      NEW.quality_minimum_weight_per_meter := NULL;
      NEW.quality_maximum_weight_per_meter := NULL;

      NEW.quality_actual_weight_per_meter := NULL;
      NEW.quality_deviation_from_nominal := NULL;
      NEW.quality_deviation_percent := NULL;
      NEW.quality_limit_difference := NULL;

      NEW.quality_status := NULL;
      NEW.quality_snapshot := NULL;
      NEW.quality_evaluated_at := NULL;

      RETURN NEW;

    END IF;


    v_lot_length :=
      v_quantity
      *
      v_length_m;


    IF v_lot_length <= 0 THEN

      RETURN NEW;

    END IF;


    v_actual :=
      v_real_weight
      /
      v_lot_length;


    v_deviation :=
      v_actual
      -
      v_nominal;


    v_deviation_percent :=
      CASE
        WHEN v_nominal > 0
        THEN
          (
            v_deviation
            /
            v_nominal
          )
          *
          100

        ELSE NULL
      END;


    IF
      v_actual
      <
      v_minimum
    THEN

      v_lot_status :=
        'below_minimum';

      v_limit_difference :=
        v_actual
        -
        v_minimum;

      v_has_below :=
        true;

      v_non_compliant_lots :=
        v_non_compliant_lots
        +
        1;


    ELSIF
      v_actual
      >
      v_maximum
    THEN

      v_lot_status :=
        'above_maximum';

      v_limit_difference :=
        v_actual
        -
        v_maximum;

      v_has_above :=
        true;

      v_non_compliant_lots :=
        v_non_compliant_lots
        +
        1;


    ELSE

      v_lot_status :=
        'compliant';

      v_limit_difference :=
        0;

      v_has_compliant :=
        true;

      v_compliant_lots :=
        v_compliant_lots
        +
        1;

    END IF;


    v_total_quantity :=
      v_total_quantity
      +
      v_quantity;


    v_total_length :=
      v_total_length
      +
      v_lot_length;


    v_total_weight :=
      v_total_weight
      +
      v_real_weight;


    v_lots_snapshot :=
      v_lots_snapshot
      ||
      jsonb_build_array(

        jsonb_build_object(

          'lot',
            NULLIF(
              TRIM(
                v_lot
                  ->>
                'lot'
              ),
              ''
            ),

          'quantity',
            ROUND(
              v_quantity,
              6
            ),

          'lengthM',
            ROUND(
              v_length_m,
              6
            ),

          'totalLengthM',
            ROUND(
              v_lot_length,
              6
            ),

          'realWeightKg',
            ROUND(
              v_real_weight,
              6
            ),

          'actualWeightPerMeter',
            ROUND(
              v_actual,
              6
            ),

          'status',
            v_lot_status,

          'deviationFromNominal',
            ROUND(
              v_deviation,
              6
            ),

          'deviationPercent',
            ROUND(
              v_deviation_percent,
              6
            ),

          'limitDifference',
            ROUND(
              v_limit_difference,
              6
            )

        )

      );

  END LOOP;


  IF
    v_total_length <= 0
    OR
    v_total_weight <= 0
  THEN

    RETURN NEW;

  END IF;


  v_total_actual :=
    v_total_weight
    /
    v_total_length;


  v_total_deviation :=
    v_total_actual
    -
    v_nominal;


  v_total_deviation_percent :=
    CASE
      WHEN v_nominal > 0
      THEN
        (
          v_total_deviation
          /
          v_nominal
        )
        *
        100

      ELSE NULL
    END;


  IF
    v_total_actual
    <
    v_minimum
  THEN

    v_total_limit_difference :=
      v_total_actual
      -
      v_minimum;

  ELSIF
    v_total_actual
    >
    v_maximum
  THEN

    v_total_limit_difference :=
      v_total_actual
      -
      v_maximum;

  ELSE

    v_total_limit_difference :=
      0;

  END IF;


  /*
   * Status geral:
   *
   * compliant:
   * todos os lotes dentro da faixa
   *
   * below_minimum:
   * todos abaixo
   *
   * above_maximum:
   * todos acima
   *
   * mixed:
   * combinação de situações
   */
  IF
    v_has_compliant
    AND
    NOT v_has_below
    AND
    NOT v_has_above
  THEN

    v_status :=
      'compliant';


  ELSIF
    v_has_below
    AND
    NOT v_has_compliant
    AND
    NOT v_has_above
  THEN

    v_status :=
      'below_minimum';


  ELSIF
    v_has_above
    AND
    NOT v_has_compliant
    AND
    NOT v_has_below
  THEN

    v_status :=
      'above_maximum';


  ELSE

    v_status :=
      'mixed';

  END IF;


  v_snapshot :=
    jsonb_build_object(

      'version',
        1,

      'evaluatedAt',
        NOW(),

      'norm',
        jsonb_build_object(

          'id',
            v_norm_id,

          'name',
            v_norm_name,

          'nominalWeightPerMeter',
            ROUND(
              v_nominal,
              6
            ),

          'minimumWeightPerMeter',
            ROUND(
              v_minimum,
              6
            ),

          'maximumWeightPerMeter',
            ROUND(
              v_maximum,
              6
            )

        ),

      'material',
        jsonb_build_object(

          'id',
            NEW.material_id,

          'name',
            NEW.material_name,

          'typeId',
            v_material_type_id,

          'typeName',
            v_material_type_name,

          'lengthM',
            ROUND(
              v_length_m,
              6
            )

        ),

      'summary',
        jsonb_build_object(

          'quantity',
            ROUND(
              v_total_quantity,
              6
            ),

          'totalLengthM',
            ROUND(
              v_total_length,
              6
            ),

          'realWeightKg',
            ROUND(
              v_total_weight,
              6
            ),

          'actualWeightPerMeter',
            ROUND(
              v_total_actual,
              6
            ),

          'status',
            v_status,

          'deviationFromNominal',
            ROUND(
              v_total_deviation,
              6
            ),

          'deviationPercent',
            ROUND(
              v_total_deviation_percent,
              6
            ),

          'limitDifference',
            ROUND(
              v_total_limit_difference,
              6
            ),

          'compliantLots',
            v_compliant_lots,

          'nonCompliantLots',
            v_non_compliant_lots

        ),

      'lots',
        v_lots_snapshot

    );


  NEW.quality_norm_id :=
    v_norm_id;

  NEW.quality_norm_name :=
    v_norm_name;

  NEW.quality_length_m :=
    ROUND(
      v_length_m,
      3
    );

  NEW.quality_total_length_m :=
    ROUND(
      v_total_length,
      6
    );

  NEW.quality_real_weight_kg :=
    ROUND(
      v_total_weight,
      6
    );

  NEW.quality_nominal_weight_per_meter :=
    ROUND(
      v_nominal,
      6
    );

  NEW.quality_minimum_weight_per_meter :=
    ROUND(
      v_minimum,
      6
    );

  NEW.quality_maximum_weight_per_meter :=
    ROUND(
      v_maximum,
      6
    );

  NEW.quality_actual_weight_per_meter :=
    ROUND(
      v_total_actual,
      6
    );

  NEW.quality_deviation_from_nominal :=
    ROUND(
      v_total_deviation,
      6
    );

  NEW.quality_deviation_percent :=
    ROUND(
      v_total_deviation_percent,
      6
    );

  NEW.quality_limit_difference :=
    ROUND(
      v_total_limit_difference,
      6
    );

  NEW.quality_status :=
    v_status;

  NEW.quality_snapshot :=
    v_snapshot;

  NEW.quality_evaluated_at :=
    NOW();


  RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS trg_production_quality_snapshot
ON production_launches;


CREATE TRIGGER trg_production_quality_snapshot
BEFORE INSERT OR UPDATE OF
  material_id,
  produced_lots
ON production_launches
FOR EACH ROW
EXECUTE FUNCTION production_quality_snapshot_trigger();

