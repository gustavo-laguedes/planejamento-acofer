import { Router } from 'express';
import { requireDb } from '../db.js';
import { requirePermission } from './middleware.js';
import { recordAuditLog } from '../audit.js';

const router = Router();
const DAILY_PRODUCTIVITY_SECONDS = 24 * 60 * 60;

function normalizeCodes(item) {
  const codes = Array.isArray(item.materialCodes)
    ? item.materialCodes
    : String(item.materialCodes || item.materialCode || '').split(',');

  return codes
    .map(code => String(code).trim())
    .filter(Boolean);
}

function normalizeSeconds(item) {
  const rawSeconds = item.timeSeconds ?? null;
  if (rawSeconds !== null && rawSeconds !== '') {
    const normalizedSeconds = String(rawSeconds).includes(',')
      ? String(rawSeconds).replace(/\./g, '').replace(',', '.')
      : rawSeconds;
    return Number(normalizedSeconds);
  }

  const minutes = Number(item.timeMinutes || 0);
  return minutes > 0 ? minutes * 60 : DAILY_PRODUCTIVITY_SECONDS;
}

function normalizePeopleCount(item) {
  const peopleCount = Number(item.peopleCount ?? item.people_count);

  if (!Number.isInteger(peopleCount) || peopleCount < 0) {
    const error = new Error(
      'Informe uma quantidade de pessoas inteira maior ou igual a zero.'
    );

    error.status = 400;
    throw error;
  }

  return peopleCount;
}

function normalizeRevisionLines(lines = []) {
  return (Array.isArray(lines) ? lines : [])
    .map((item, index) => ({
      machineName: String(
        item.machineName
        || item.machine_name
        || ''
      ).trim(),

      machinePriority: index + 1,

      peopleCount: normalizePeopleCount(item),

      outputQty: Number(
        item.outputQty
        ?? item.output_qty
      ),

      timeSeconds: normalizeSeconds(item),

      notes: item.notes || null
    }))
    .filter(item => item.machineName);
}

function lineSignature(line) {
  return JSON.stringify([
    String(
      line.machine_name
      ?? line.machineName
      ?? ''
    ).trim(),

    Number(
      line.machine_priority
      ?? line.machinePriority
      ?? 0
    ),

    Number(
      line.people_count
      ?? line.peopleCount
      ?? 0
    ),

    Number(
      line.output_qty
      ?? line.outputQty
      ?? 0
    ),

    Number(
      line.time_seconds
      ?? line.timeSeconds
      ?? DAILY_PRODUCTIVITY_SECONDS
    ),

    String(
      line.notes
      || ''
    )
  ]);
}

function sameRevision(currentRows, requestedLines) {
  if (currentRows.length !== requestedLines.length) {
    return false;
  }

  return currentRows.every(
    (row, index) =>
      lineSignature(row)
      ===
      lineSignature(
        requestedLines[index]
      )
  );
}

function revisionUserName(user = {}) {
  return String(
    user.name
    || user.email
    || user.username
    || user.id
    || 'Usuário'
  ).trim();
}

async function materialById(
  db,
  materialId,
  { lock = false } = {}
) {
  const rows = lock
    ? await db`
        SELECT *
        FROM materials
        WHERE id = ${materialId}
          AND active = true
        FOR UPDATE
      `
    : await db`
        SELECT *
        FROM materials
        WHERE id = ${materialId}
          AND active = true
      `;

  return rows[0] || null;
}

async function linkLegacyRows(db, material) {
  const codes = Array.isArray(material?.codes)
    ? material.codes.map(String)
    : [];

  await db`
    UPDATE productivity_matrix

    SET material_id = ${material.id}

    WHERE material_id IS NULL

      AND (
        LOWER(TRIM(material_name))
          =
        LOWER(TRIM(${material.name}))

        OR

        material_code =
          ANY(${codes}::text[])

        OR

        COALESCE(
          material_codes,
          ARRAY[]::text[]
        )
        &&
        ${codes}::text[]
      )
  `;
}

router.get(
  '/',
  async (req, res, next) => {
    try {
      const db = requireDb();

      const search =
        `%${req.query.search || ''}%`;

      const rows = await db`
        SELECT *
        FROM productivity_matrix_current

        WHERE (
          ${req.query.search || ''} = ''

          OR material_name ILIKE ${search}
          OR machine_name ILIKE ${search}
          OR material_code ILIKE ${search}

          OR array_to_string(
            COALESCE(
              material_codes,
              ARRAY[]::text[]
            ),
            ', '
          ) ILIKE ${search}
        )

        ORDER BY
          material_name,
          machine_priority,
          machine_name,
          people_count
      `;

      res.json(rows);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/history/:materialId',
  async (req, res, next) => {
    try {
      const db = requireDb();

      const material =
        await materialById(
          db,
          Number(req.params.materialId)
        );

      if (!material) {
        return res
          .status(404)
          .json({
            error:
              'Material não encontrado.'
          });
      }

      await linkLegacyRows(
        db,
        material
      );

      const rows = await db`
        SELECT *
        FROM productivity_matrix

        WHERE material_id =
          ${material.id}

          AND active = true

        ORDER BY
          revision DESC,
          machine_priority,
          machine_name,
          people_count
      `;

      const revisions =
        new Map();

      for (const row of rows) {
        const revision =
          Number(
            row.revision
            || 0
          );

        if (
          !revisions.has(revision)
        ) {
          revisions.set(
            revision,
            {
              revision,

              createdAt:
                row.revision_created_at
                || row.created_at,

              createdBy:
                row.revision_created_by
                || null,

              lines:
                []
            }
          );
        }

        revisions
          .get(revision)
          .lines
          .push(row);
      }

      res.json({
        material: {
          id:
            material.id,

          name:
            material.name,

          codes:
            material.codes
            || [],

          unit:
            material.primary_unit
        },

        revisions:
          [...revisions.values()]
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/revision',
  requirePermission(
    'matrix:write'
  ),
  async (req, res, next) => {
    try {
      const db = requireDb();

      const materialId =
        Number(
          req.body.materialId
        );

      const requestedLines =
        normalizeRevisionLines(
          req.body.lines
        );

      if (
        !Number.isInteger(materialId)
        ||
        materialId <= 0
      ) {
        return res
          .status(400)
          .json({
            error:
              'Material inválido.'
          });
      }

      if (
        !requestedLines.length
      ) {
        return res
          .status(400)
          .json({
            error:
              'Informe pelo menos uma linha de produtividade.'
          });
      }

      if (
        requestedLines.some(
          line =>
            !(line.outputQty > 0)
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'A quantidade produzida por dia deve ser maior que zero.'
          });
      }

      const result =
        await db.begin(
          async tx => {
            const material =
              await materialById(
                tx,
                materialId,
                {
                  lock: true
                }
              );

            if (!material) {
              const error =
                new Error(
                  'Material não encontrado.'
                );

              error.status = 404;

              throw error;
            }

            await linkLegacyRows(
              tx,
              material
            );

            const [revisionRow] =
              await tx`
                SELECT
                  COALESCE(
                    MAX(revision),
                    -1
                  )::integer AS revision

                FROM productivity_matrix

                WHERE material_id =
                  ${material.id}
              `;

            const currentRevision =
              Number(
                revisionRow?.revision
                ?? -1
              );

            const currentRows =
              currentRevision >= 0
                ? await tx`
                    SELECT *
                    FROM productivity_matrix

                    WHERE material_id =
                      ${material.id}

                      AND revision =
                        ${currentRevision}

                      AND active = true

                    ORDER BY
                      machine_priority,
                      machine_name,
                      people_count
                  `
                : [];

            if (
              currentRevision >= 0
              &&
              sameRevision(
                currentRows,
                requestedLines
              )
            ) {
              return {
                unchanged:
                  true,

                revision:
                  currentRevision,

                rows:
                  currentRows
              };
            }

            const revision =
              currentRevision < 0
                ? 0
                : currentRevision + 1;

            const materialCodes =
              normalizeCodes({
                materialCodes:
                  material.codes
                  || []
              });

            const primaryCode =
              materialCodes[0]
              || null;

            const createdBy =
              revisionUserName(
                req.user
              );

            const inserted =
              [];

            for (
              const line
              of requestedLines
            ) {
              const [row] =
                await tx`
                  INSERT INTO productivity_matrix (
                    material_id,
                    material_name,
                    material_code,
                    material_codes,
                    machine_name,
                    machine_priority,
                    people_count,
                    output_qty,
                    output_unit,
                    time_minutes,
                    time_seconds,
                    notes,
                    active,
                    revision,
                    revision_created_at,
                    revision_created_by
                  )

                  VALUES (
                    ${material.id},
                    ${material.name},
                    ${primaryCode},
                    ${materialCodes},
                    ${line.machineName},
                    ${line.machinePriority},
                    ${line.peopleCount},
                    ${line.outputQty},
                    ${material.primary_unit || 'un'},
                    ${line.timeSeconds / 60},
                    ${line.timeSeconds},
                    ${line.notes},
                    true,
                    ${revision},
                    now(),
                    ${createdBy}
                  )

                  RETURNING *
                `;

              inserted.push(row);
            }

            await recordAuditLog(
              tx,
              {
                user:
                  req.user,

                action:
                  'Revisão da matriz de produtividade',

                module:
                  'Matriz de Produtividade',

                description:
                  `Criou Rev ${revision} da matriz de ${material.name}`,

                recordRef:
                  material.id
              }
            );

            return {
              unchanged:
                false,

              revision,

              rows:
                inserted
            };
          }
        );

      res
        .status(
          result.unchanged
            ? 200
            : 201
        )
        .json(result);

    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  requirePermission(
    'matrix:write'
  ),
  (req, res) => {
    res
      .status(409)
      .json({
        error:
          'Use o salvamento por revisão da matriz de produtividade.'
      });
  }
);

router.put(
  '/:id',
  requirePermission(
    'matrix:write'
  ),
  (req, res) => {
    res
      .status(409)
      .json({
        error:
          'Edição direta desabilitada. Crie uma nova revisão da matriz de produtividade.'
      });
  }
);

router.delete(
  '/:id',
  requirePermission(
    'matrix:write'
  ),
  (req, res) => {
    res
      .status(409)
      .json({
        error:
          'Exclusão direta desabilitada. Remova a linha em uma nova revisão da matriz de produtividade.'
      });
  }
);

export default router;
