import { Router } from 'express';
import { requireDb } from '../db.js';
import { requirePermission } from './middleware.js';
import { recordAuditLog } from '../audit.js';

const router = Router();

function normalizeName(value) {
  return String(value || '').trim();
}

function normalizeCode(value) {
  return String(value || '').trim();
}

function auditDescription(row, user) {
  const when = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const userName = String(user?.name || user?.email || 'Sistema');
  return `Local excluído/inativado. Usuário: ${userName}. Data/hora: ${when}. Código: ${row.code}. Nome: ${row.name}.`;
}

router.get('/', async (req, res, next) => {
  try {
    const db = requireDb();
    const search = `%${req.query.search || ''}%`;
    const rows = await db`
      SELECT *
      FROM locations
      WHERE (${req.query.search || ''} = '' OR code ILIKE ${search} OR name ILIKE ${search})
      ORDER BY active DESC, code NULLS LAST, name
    `;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission('registrations:write'), async (req, res, next) => {
  try {
    const code = normalizeCode(req.body.code);
    const name = normalizeName(req.body.name);
    if (!code) return res.status(400).json({ error: 'Código do local é obrigatório.' });
    if (!name) return res.status(400).json({ error: 'Nome do local e obrigatorio.' });

    const db = requireDb();
    const [existing] = await db`SELECT id FROM locations WHERE code = ${code}`;
    if (existing) return res.status(400).json({ error: 'Ja existe um local com este codigo.' });

    const [row] = await db`
      INSERT INTO locations (code, name, active)
      VALUES (${code}, ${name}, ${req.body.active !== false})
      RETURNING *
    `;
    await recordAuditLog(db, {
      user: req.user,
      action: 'Cadastro de local',
      module: 'Cadastros',
      description: `Cadastrou local ${row.name} (${row.code})`,
      recordRef: row.id
    });
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requirePermission('registrations:write'), async (req, res, next) => {
  try {
    const code = normalizeCode(req.body.code);
    const name = normalizeName(req.body.name);
    if (!code) return res.status(400).json({ error: 'Código do local é obrigatório.' });
    if (!name) return res.status(400).json({ error: 'Nome do local e obrigatorio.' });

    const db = requireDb();
    const [existing] = await db`SELECT id FROM locations WHERE code = ${code} AND id <> ${req.params.id}`;
    if (existing) return res.status(400).json({ error: 'Ja existe um local com este codigo.' });

    const [row] = await db`
      UPDATE locations
      SET code = ${code},
          name = ${name},
          active = ${req.body.active !== false},
          updated_at = now()
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!row) return res.status(404).json({ error: 'Local não encontrado.' });
    await recordAuditLog(db, {
      user: req.user,
      action: 'Edicao de local',
      module: 'Cadastros',
      description: `Editou local ${row.name} (${row.code})`,
      recordRef: row.id
    });
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requirePermission('registrations:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    const [row] = await db`
      UPDATE locations
      SET active = false,
          updated_at = now()
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!row) return res.status(404).json({ error: 'Local nao encontrado.' });
    await recordAuditLog(db, {
      user: req.user,
      action: 'Local excluído/inativado',
      module: 'Cadastros',
      description: auditDescription(row, req.user),
      recordRef: row.id
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
