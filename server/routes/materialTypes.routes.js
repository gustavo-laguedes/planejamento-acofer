import { Router } from 'express';
import { requireDb } from '../db.js';
import { requirePermission } from './middleware.js';
import { recordAuditLog } from '../audit.js';

const router = Router();

function normalizeName(value) {
  return String(value || '').trim();
}

router.get('/', async (req, res, next) => {
  try {
    const db = requireDb();

    const rawSearch =
      String(req.query.search || '').trim();

    const search =
      `%${rawSearch}%`;

    const rows = await db`
      SELECT *
      FROM material_types
      WHERE (
        ${rawSearch} = ''
        OR name ILIKE ${search}
      )
      ORDER BY
        active DESC,
        name
    `;

    res.json(rows);

  } catch (error) {
    next(error);
  }
});

router.post(
  '/',
  requirePermission('registrations:write'),
  async (req, res, next) => {
    try {
      const name =
        normalizeName(req.body.name);

      if (!name) {
        return res.status(400).json({
          error:
            'Nome do tipo de material é obrigatório.'
        });
      }

      const db =
        requireDb();

      const [existing] = await db`
        SELECT id
        FROM material_types
        WHERE LOWER(TRIM(name))
          = LOWER(TRIM(${name}))
      `;

      if (existing) {
        return res.status(400).json({
          error:
            'Já existe um tipo de material com este nome.'
        });
      }

      const [row] = await db`
        INSERT INTO material_types (
          name,
          requires_length,
          active
        )
        VALUES (
          ${name},
          ${req.body.requiresLength === true},
          ${req.body.active !== false}
        )
        RETURNING *
      `;

      await recordAuditLog(db, {
        user: req.user,
        action:
          'Cadastro de tipo de material',
        module:
          'Cadastros',
        description:
          `Cadastrou tipo de material ${row.name}`,
        recordRef:
          row.id
      });

      res.status(201).json(row);

    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/:id',
  requirePermission('registrations:write'),
  async (req, res, next) => {
    try {
      const name =
        normalizeName(req.body.name);

      if (!name) {
        return res.status(400).json({
          error:
            'Nome do tipo de material é obrigatório.'
        });
      }

      const db =
        requireDb();

      const [existing] = await db`
        SELECT id
        FROM material_types
        WHERE LOWER(TRIM(name))
          = LOWER(TRIM(${name}))
          AND id <> ${req.params.id}
      `;

      if (existing) {
        return res.status(400).json({
          error:
            'Já existe um tipo de material com este nome.'
        });
      }

      const [row] = await db`
        UPDATE material_types
        SET
          name = ${name},
          requires_length =
            ${req.body.requiresLength === true},
          active =
            ${req.body.active !== false},
          updated_at = now()
        WHERE id = ${req.params.id}
        RETURNING *
      `;

      if (!row) {
        return res.status(404).json({
          error:
            'Tipo de material não encontrado.'
        });
      }

      await recordAuditLog(db, {
        user: req.user,
        action:
          'Edição de tipo de material',
        module:
          'Cadastros',
        description:
          `Editou tipo de material ${row.name}`,
        recordRef:
          row.id
      });

      res.json(row);

    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:id',
  requirePermission('registrations:write'),
  async (req, res, next) => {
    try {
      const db =
        requireDb();

      const [usage] = await db`
        SELECT COUNT(*)::int AS count
        FROM materials
        WHERE material_type_id =
          ${req.params.id}
      `;

      if (
        Number(usage?.count || 0) > 0
      ) {
        return res.status(409).json({
          error:
            'Este tipo de material está vinculado a materiais e não pode ser excluído.'
        });
      }

      const [row] = await db`
        UPDATE material_types
        SET
          active = false,
          updated_at = now()
        WHERE id = ${req.params.id}
        RETURNING *
      `;

      if (!row) {
        return res.status(404).json({
          error:
            'Tipo de material não encontrado.'
        });
      }

      await recordAuditLog(db, {
        user: req.user,
        action:
          'Tipo de material excluído/inativado',
        module:
          'Cadastros',
        description:
          `Inativou tipo de material ${row.name}`,
        recordRef:
          row.id
      });

      res.status(204).end();

    } catch (error) {
      next(error);
    }
  }
);

export default router;
