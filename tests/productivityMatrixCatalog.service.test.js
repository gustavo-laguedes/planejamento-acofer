import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  productivityCatalogGroupKey,
  productivityRowsForCatalogGroup,
  summarizeProductivityCatalog
} from '../services/productivityMatrixCatalog.service.js';

const materials = [
  { id: 65, name: '3,4 Longitudinal - 3m', codes: ['00808700065'], primary_unit: 'un', active: true },
  { id: 80, name: 'Aço-8', codes: ['00808700080', '00808700065'], primary_unit: 'un', active: true },
  { id: 90, name: 'Material homônimo', codes: ['HOMO-A'], primary_unit: 'un', active: true },
  { id: 91, name: 'Material homônimo', codes: ['HOMO-B'], primary_unit: 'un', active: true }
];

const longitudinalRows = [
  { id: '1', material_name: '3,4 Longitudinal - 3m', material_code: '00808700065', material_codes: ['00808700065'], machine_name: 'EC-125', machine_priority: 1, people_count: 1, output_qty: 8490, output_unit: 'un', active: true },
  { id: '5', material_name: '3,4 Longitudinal - 3m', material_code: '00808700065', material_codes: ['00808700065'], machine_name: 'EC-60', machine_priority: 2, people_count: 1, output_qty: 2830, output_unit: 'un', active: true }
];
const relatedOtherMaterial = {
  id: '8', material_name: 'Aço-8', material_code: '00808700080',
  material_codes: ['00808700080', '00808700065'], machine_name: 'Aço-8',
  machine_priority: 1, people_count: 1, output_qty: 9259, output_unit: 'un', active: true
};

const matrix = [
  ...longitudinalRows,
  relatedOtherMaterial,
  { id: '9', material_name: 'Material homônimo', material_code: 'HOMO-A', material_codes: ['HOMO-A'], machine_name: 'M-A', machine_priority: 1, people_count: 1, output_qty: 100, active: true },
  { id: '10', material_name: 'Material homônimo', material_code: 'HOMO-B', material_codes: ['HOMO-B'], machine_name: 'M-B', machine_priority: 1, people_count: 1, output_qty: 200, active: true },
  { id: '11', material_name: 'Material homônimo similar', material_code: 'HOMO-A', material_codes: ['HOMO-A'], machine_name: 'M-C', machine_priority: 1, people_count: 1, output_qty: 300, active: true }
];

const summaries = summarizeProductivityCatalog({ materials, productivityMatrix: matrix });
const longitudinal = summaries.find(summary => summary.material_name === '3,4 Longitudinal - 3m');
assert.ok(longitudinal);
assert.equal(longitudinal.line_count, 2, 'duas linhas com mesmo nome e código formam um grupo');
assert.deepEqual(longitudinal.machines, ['EC-125', 'EC-60'], 'o grupo contém somente as máquinas persistidas');
assert.equal(longitudinal.max_output_qty, 8490);
assert.equal(longitudinal.catalog_material_id, 65);

const openedLines = productivityRowsForCatalogGroup({
  groupKey: longitudinal.material_key,
  materials,
  productivityMatrix: matrix
});
assert.deepEqual(openedLines.map(row => row.id), ['1', '5'], 'o modal recebe somente IDs do grupo selecionado');
assert.deepEqual(openedLines.map(row => row.machine_name), ['EC-125', 'EC-60']);
assert.equal(openedLines.some(row => row.machine_name === 'Aço-8'), false, 'código relacionado não incorpora outro material');
assert.equal(openedLines.length > 0, true, 'grupo real não deve cair na criação de linha padrão');

const homonymSummaries = summaries.filter(summary => summary.material_name === 'Material homônimo');
assert.equal(homonymSummaries.length, 2, 'homônimos com códigos principais diferentes permanecem separados');
assert.deepEqual(homonymSummaries.map(summary => summary.machines).sort(), [['M-A'], ['M-B']]);
assert.notEqual(
  productivityCatalogGroupKey(matrix[3], materials),
  productivityCatalogGroupKey(matrix[5], materials),
  'nomes semelhantes não se misturam nem mesmo quando o código principal coincide'
);

const pageSource = readFileSync(new URL('../pages/ProductivityMatrixPage.js', import.meta.url), 'utf8');
assert.doesNotMatch(pageSource, /productivityMatrixResolution\.service\.js|resolveProductivityMaterial|summarizeProductivityMatrix/);
assert.match(pageSource, /productivityRowsForCatalogGroup\(\{ groupKey: materialKey, materials, productivityMatrix: rows \}\)/);
assert.match(pageSource, /renderLines\(groupLines\)/, 'linhas reais são entregues ao modal sem fallback operacional');
assert.match(pageSource, /api\('\/productivity\/revision'/ise adicional.
NÃO procure outros arquivos.
NÃO faça refactor.
NÃO faça melhorias fora do que está escrito.
NÃO rode testes.
NÃO rode git diff.
NÃO altere versão manualmente.
NÃO altere arquivos diferentes dos citados.

Depois de salvar os arquivos, execute SOMENTE:

npm run db:schema

Esse comando é necessário para criar a estrutura de revisões no banco.

Depois encerre.

==================================================
1. CRIE ESTE NOVO ARQUIVO
==================================================

ARQUIVO:

database/028_productivity_revisions.sql

CRIE O ARQUIVO EXATAMENTE COM ESTE CONTEÚDO:

ALTER TABLE productivity_matrix
  ADD COLUMN IF NOT EXISTS material_id BIGINT REFERENCES materials(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ADD COLUMN IF NOT EXISTS revision_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision_created_by TEXT;

UPDATE productivity_matrix pm
SET material_id = (
  SELECT m.id
  FROM materials m
  WHERE m.active = true
    AND (
      LOWER(TRIM(m.name)) = LOWER(TRIM(pm.material_name))
      OR (
        pm.material_code IS NOT NULL
        AND pm.material_code = ANY(COALESCE(m.codes, ARRAY[]::text[]))
      )
      OR COALESCE(pm.material_codes, ARRAY[]::text[])
         && COALESCE(m.codes, ARRAY[]::text[])
    )
  ORDER BY
    CASE
      WHEN LOWER(TRIM(m.name)) = LOWER(TRIM(pm.material_name))
      THEN 0
      ELSE 1
    END,
    m.id
  LIMIT 1
)
WHERE pm.material_id IS NULL;

UPDATE productivity_matrix
SET revision_created_at =
  COALESCE(
    revision_created_at,
    created_at,
    updated_at,
    now()
  )
WHERE revision_created_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_productivity_matrix_material_revision
  ON productivity_matrix (
    material_id,
    revision,
    machine_priority,
    machine_name
  );

DROP VIEW IF EXISTS productivity_matrix_current;

CREATE VIEW productivity_matrix_current AS
SELECT pm.*
FROM productivity_matrix pm
WHERE pm.active = true
  AND (
    pm.material_id IS NULL
    OR pm.revision = (
      SELECT MAX(current_pm.revision)
      FROM productivity_matrix current_pm
      WHERE current_pm.material_id = pm.material_id
        AND current_pm.active = true
    )
  );

ALTER TABLE production_plans
  ADD COLUMN IF NOT EXISTS productivity_matrix_snapshot
  JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE production_plans
SET productivity_matrix_snapshot =
  COALESCE(
    (
      SELECT jsonb_agg(
        to_jsonb(pm)
        ORDER BY
          pm.material_name,
          pm.machine_priority,
          pm.machine_name,
          pm.people_count
      )
      FROM productivity_matrix_current pm
    ),
    '[]'::jsonb
  )
WHERE productivity_matrix_snapshot IS NULL
   OR productivity_matrix_snapshot = '[]'::jsonb;

NÃO FAÇA MAIS NADA NESTE ARQUIVO.

==================================================
2. ARQUIVO
server/scripts/apply-schema.js
==================================================

ACHE EXATAMENTE:

  '027_planning_production_sequence.sql',
'002_indexes.sql',

SUBSTITUA EXATAMENTE POR:

  '027_planning_production_sequence.sql',
  '028_productivity_revisions.sql',
'002_indexes.sql',

NÃO ALTERE MAIS NADA NESSE ARQUIVO.

==================================================
3. ARQUIVO
server/routes/productivity.routes.js
==================================================

SUBSTITUA TODO O CONTEÚDO DO ARQUIVO
EXATAMENTE PELO CONTEÚDO ABAIXO:

import { Router } from 'express';
import { requireDb } from '../db.js';
import { requirePermission } from './middleware.js';
import { recordAuditLog } from '../audit.js';

const router = Router();
const DAILY_PRODUCTIVITY_SECONDS = 24 * 60 * 60;

function normalizeCodes(item) {
  const codes = Array.isArray(item.materialCodes)
    ? item.materialCodes
    : String(
        item.materialCodes
        || item.materialCode
        || ''
      ).split(',');

  return codes
    .map(code => String(code).trim())
    .filter(Boolean);
}

function normalizeSeconds(item) {
  const rawSeconds =
    item.timeSeconds
    ?? null;

  if (
    rawSeconds !== null
    &&
    rawSeconds !== ''
  ) {
    const normalizedSeconds =
      String(rawSeconds).includes(',')
        ? String(rawSeconds)
            .replace(/\./g, '')
            .replace(',', '.')
        : rawSeconds;

    return Number(normalizedSeconds);
  }

  const minutes =
    Number(item.timeMinutes || 0);

  return minutes > 0
    ? minutes * 60
    : DAILY_PRODUCTIVITY_SECONDS;
}

function normalizePriority(item) {
  const priority =
    Number(
      item.machinePriority
      ?? item.machine_priority
      ?? 1
    );

  return Number.isFinite(priority)
    && priority > 0
      ? Math.floor(priority)
      : 1;
}

function normalizePeopleCount(item) {
  const peopleCount =
    Number(
      item.peopleCount
      ?? item.people_count
    );

  if (
    !Number.isInteger(peopleCount)
    ||
    peopleCount < 0
  ) {
    const error =
      new Error(
        'Informe uma quantidade de pessoas inteira maior ou igual a zero.'
      );

    error.status = 400;

    throw error;
  }

  return peopleCount;
}

function normalizeRevisionLines(lines = []) {
  return (
    Array.isArray(lines)
      ? lines
      : []
  )
    .map(
      (item, index) => ({
        machineName:
          String(
            item.machineName
            || item.machine_name
            || ''
          ).trim(),

        machinePriority:
          index + 1,

        peopleCount:
          normalizePeopleCount(item),

        outputQty:
          Number(
            item.outputQty
            ?? item.output_qty
          ),

        timeSeconds:
          normalizeSeconds(item),

        notes:
          item.notes
          || null
      })
    )
    .filter(
      item =>
        item.machineName
    );
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

function sameRevision(
  currentRows,
  requestedLines
) {
  if (
    currentRows.length
    !==
    requestedLines.length
  ) {
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
  const rows =
    lock
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

  return rows[0]
    || null;
}

async function linkLegacyRows(
  db,
  material
) {
  const codes =
    Array.isArray(material?.codes)
      ? material.codes.map(String)
      : [];

  await db`
    UPDATE productivity_matrix

    SET material_id =
      ${material.id}

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
      const db =
        requireDb();

      const search =
        `%${req.query.search || ''}%`;

      const rows =
        await db`
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
      const db =
        requireDb();

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

      const rows =
        await db`
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
      const db =
        requireDb();

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

NÃO ALTERE MAIS NADA NESSE ARQUIVO.

==================================================
4. ARQUIVO
services/productivityMatrixCatalog.service.js
==================================================

ACHE EXATAMENTE:

      active_count: ordered.length,
      max_output_qty: Math.max(...ordered.map(row => Number(row.output_qty ?? row.outputQty) || 0))

SUBSTITUA EXATAMENTE POR:

      active_count: ordered.length,
      revision: Math.max(...ordered.map(row => Number(row.revision ?? 0) || 0)),
      max_output_qty: Math.max(...ordered.map(row => Number(row.output_qty ?? row.outputQty) || 0))

console.log('productivityMatrixCatalog.service.test.js: ok');
