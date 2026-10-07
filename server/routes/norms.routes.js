import { Router } from 'express';
import { requireDb } from '../db.js';
import { requirePermission } from './middleware.js';
import { recordAuditLog } from '../audit.js';

const router = Router();

function text(value) {
  return String(value ?? '').trim();
}

function decimal(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return NaN;
  return Number(normalized);
}

function normalizeItems(value) {
  const rows = Array.isArray(value) ? value : [];

  return rows.map(item => ({
    materialId:
      Number(
        item.materialId
        ?? item.material_id
      ),

    nominalWeightPerMeter:
      decimal(
        item.nominalWeightPerMeter
        ?? item.nominal_weight_per_meter
      ),

    minimumWeightPerMeter:
      decimal(
        item.minimumWeightPerMeter
        ?? item.minimum_weight_per_meter
      ),

    maximumWeightPerMeter:
      decimal(
        item.maximumWeightPerMeter
        ?? item.maximum_weight_per_meter
      )
  }));
}

function validatePayload(body = {}) {
  const name =
    text(body.name);

  const description =
    text(body.description);

  const items =
    normalizeItems(body.materials);

  if (!name) {
    return {
      error:
        'Nome da norma é obrigatório.'
    };
  }

  if (!items.length) {
    return {
      error:
        'Adicione pelo menos um material à norma.'
    };
  }

  const materialIds =
    items.map(
      item => item.materialId
    );

  if (
    materialIds.some(
      id =>
        !Number.isInteger(id)
        || id <= 0
    )
  ) {
    return {
      error:
        'Existe material inválido na norma.'
    };
  }

  if (
    new Set(materialIds).size
    !==
    materialIds.length
  ) {
    return {
      error:
        'O mesmo material não pode aparecer duas vezes na mesma norma.'
    };
  }

  for (const item of items) {
    if (
      !Number.isFinite(
        item.nominalWeightPerMeter
      )
      ||
      !Number.isFinite(
        item.minimumWeightPerMeter
      )
      ||
      !Number.isFinite(
        item.maximumWeightPerMeter
      )
      ||
      item.nominalWeightPerMeter <= 0
      ||
      item.minimumWeightPerMeter <= 0
      ||
      item.maximumWeightPerMeter <= 0
    ) {
      return {
        error:
          'Peso nominal, mínimo e máximo devem ser maiores que zero.'
      };
    }

    if (
      item.minimumWeightPerMeter
        >
      item.nominalWeightPerMeter

      ||

      item.nominalWeightPerMeter
        >
      item.maximumWeightPerMeter
    ) {
      return {
        error:
          'Os pesos devem respeitar: mínimo ≤ nominal ≤ máximo.'
      };
    }
  }

  return {
    name,
    description,
    active:
      body.active !== false,
    items
  };
}

async function ensureMaterialsExist(
  db,
  items
) {
  const ids =
    items.map(
      item => item.materialId
    );

  const rows =
    await db`
      SELECT id
      FROM materials
      WHERE id = ANY(${ids}::bigint[])
        AND active = true
    `;

  if (
    rows.length
    !==
    ids.length
  ) {
    const error =
      new Error(
        'Um ou mais materiais informados não existem ou estão inativos.'
      );

    error.status = 400;

    throw error;
  }
}

async function replaceNormMaterials(
  db,
  normId,
  items
) {
  await db`
    DELETE FROM quality_norm_materials
    WHERE norm_id = ${normId}
  `;

  for (const item of items) {
    await db`
      INSERT INTO quality_norm_materials (
        norm_id,
        material_id,
        nominal_weight_per_meter,
        minimum_weight_per_meter,
        maximum_weight_per_meter
      )
      VALUES (
        ${normId},
        ${item.materialId},
        ${item.nominalWeightPerMeter},
        ${item.minimumWeightPerMeter},
        ${item.maximumWeightPerMeter}
      )
    `;
  }
}

router.get(
  '/',
  async (req, res, next) => {
    try {
      const db =
        requireDb();

      const rawSearch =
        text(
          req.query.search
        );

      const search =
        `%${rawSearch}%`;

      const rows =
        await db`
          SELECT
            n.*,

            COALESCE(
              json_agg(
                json_build_object(
                  'id',
                    qnm.id,

                  'materialId',
                    m.id,

                  'materialName',
                    m.name,

                  'materialCodes',
                    m.codes,

                  'nominalWeightPerMeter',
                    qnm.nominal_weight_per_meter,

                  'minimumWeightPerMeter',
                    qnm.minimum_weight_per_meter,

                  'maximumWeightPerMeter',
                    qnm.maximum_weight_per_meter
                )
                ORDER BY m.name
              )
              FILTER (
                WHERE qnm.id IS NOT NULL
              ),
              '[]'::json
            ) AS materials

          FROM quality_norms n

          LEFT JOIN quality_norm_materials qnm
            ON qnm.norm_id = n.id

          LEFT JOIN materials m
            ON m.id = qnm.material_id

          WHERE (
            ${rawSearch} = ''

            OR n.name ILIKE ${search}

            OR COALESCE(
              n.description,
              ''
            ) ILIKE ${search}

            OR EXISTS (
              SELECT 1

              FROM quality_norm_materials search_qnm

              JOIN materials search_m
                ON search_m.id =
                  search_qnm.material_id

              WHERE search_qnm.norm_id =
                n.id

                AND (
                  search_m.name
                    ILIKE ${search}

                  OR

                  array_to_string(
                    COALESCE(
                      search_m.codes,
                      ARRAY[]::text[]
                    ),
                    ', '
                  )
                    ILIKE ${search}
                )
            )
          )

          GROUP BY n.id

          ORDER BY
            n.active DESC,
            n.name
        `;

      res.json(rows);

    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  requirePermission(
    'registrations:write'
  ),
  async (req, res, next) => {
    try {
      const payload =
        validatePayload(
          req.body
        );

      if (payload.error) {
        return res
          .status(400)
          .json({
            error:
              payload.error
          });
      }

      const db =
        requireDb();

      const row =
        await db.begin(
          async tx => {
            const [existing] =
              await tx`
                SELECT id

                FROM quality_norms

                WHERE
                  LOWER(TRIM(name))
                  =
                  LOWER(
                    TRIM(${payload.name})
                  )
              `;

            if (existing) {
              const error =
                new Error(
                  'Já existe uma norma com este nome.'
                );

              error.status = 400;

              throw error;
            }

            await ensureMaterialsExist(
              tx,
              payload.items
            );

            const [created] =
              await tx`
                INSERT INTO quality_norms (
                  name,
                  description,
                  active
                )
                VALUES (
                  ${payload.name},
                  ${payload.description || null},
                  ${payload.active}
                )
                RETURNING *
              `;

            await replaceNormMaterials(
              tx,
              created.id,
              payload.items
            );

            return created;
          }
        );

      await recordAuditLog(
        db,
        {
          user:
            req.user,

          action:
            'Cadastro de norma',

          module:
            'Cadastros',

          description:
            `Cadastrou norma ${row.name}`,

          recordRef:
            row.id
        }
      );

      res
        .status(201)
        .json(row);

    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/:id',
  requirePermission(
    'registrations:write'
  ),
  async (req, res, next) => {
    try {
      const payload =
        validatePayload(
          req.body
        );

      if (payload.error) {
        return res
          .status(400)
          .json({
            error:
              payload.error
          });
      }

      const db =
        requireDb();

      const row =
        await db.begin(
          async tx => {
            const [existing] =
              await tx`
                SELECT id

                FROM quality_norms

                WHERE
                  LOWER(TRIM(name))
                  =
                  LOWER(
                    TRIM(${payload.name})
                  )

                  AND id <>
                    ${req.params.id}
              `;

            if (existing) {
              const error =
                new Error(
                  'Já existe uma norma com este nome.'
                );

              error.status = 400;

              throw error;
            }

            await ensureMaterialsExist(
              tx,
              payload.items
            );

            const [updated] =
              await tx`
                UPDATE quality_norms

                SET
                  name =
                    ${payload.name},

                  description =
                    ${payload.description || null},

                  active =
                    ${payload.active},

                  updated_at =
                    now()

                WHERE id =
                  ${req.params.id}

                RETURNING *
              `;

            if (!updated) {
              const error =
                new Error(
                  'Norma não encontrada.'
                );

              error.status = 404;

              throw error;
            }

            await replaceNormMaterials(
              tx,
              updated.id,
              payload.items
            );

            return updated;
          }
        );

      await recordAuditLog(
        db,
        {
          user:
            req.user,

          action:
            'Edição de norma',

          module:
            'Cadastros',

          description:
            `Editou norma ${row.name}`,

          recordRef:
            row.id
        }
      );

      res.json(row);

    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:id',
  requirePermission(
    'registrations:write'
  ),
  async (req, res, next) => {
    try {
      const db =
        requireDb();

      const [row] =
        await db`
          UPDATE quality_norms

          SET
            active = false,
            updated_at = now()

          WHERE id =
            ${req.params.id}

          RETURNING *
        `;

      if (!row) {
        return res
          .status(404)
          .json({
            error:
              'Norma não encontrada.'
          });
      }

      await recordAuditLog(
        db,
        {
          user:
            req.user,

          action:
            'Norma excluída/inativada',

          module:
            'Cadastros',

          description:
            `Inativou norma ${row.name}`,

          recordRef:
            row.id
        }
      );

      res
        .status(204)
        .end();

    } catch (error) {
      next(error);
    }
  }
);

export default router;
