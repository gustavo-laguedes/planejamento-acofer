import { Router } from 'express';
import { requireDb } from '../db.js';
import { requirePermission } from './middleware.js';
import { recordAuditLog } from '../audit.js';

const router = Router();

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
  return minutes > 0 ? minutes * 60 : 24 * 60 * 60;
}

function normalizePriority(item) {
  const priority = Number(item.machinePriority ?? item.machine_priority ?? 1);
  return Number.isFinite(priority) && priority > 0 ? Math.floor(priority) : 1;
}

function normalizePeopleCount(item) {
  const peopleCount = Number(item.peopleCount ?? item.people_count);
  if (!Number.isInteger(peopleCount) || peopleCount < 0) {
    const error = new Error('Informe uma quantidade de pessoas inteira maior ou igual a zero.');
    error.status = 400;
    throw error;
  }
  return peopleCount;
}

router.get('/', async (req, res, next) => {
  try {
    const db = requireDb();
    const search = `%${req.query.search || ''}%`;
    const rows = await db`
      SELECT *
      FROM productivity_matrix
      WHERE active = true
        AND (${req.query.search || ''} = ''
        OR material_name ILIKE ${search}
        OR machine_name ILIKE ${search}
        OR material_code ILIKE ${search}
        OR array_to_string(COALESCE(material_codes, ARRAY[]::text[]), ', ') ILIKE ${search})
      ORDER BY material_name, machine_priority, machine_name, people_count
    `;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission('matrix:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    const item = req.body;
    const materialCodes = normalizeCodes(item);
    const primaryCode = materialCodes[0] || null;
    const timeSeconds = normalizeSeconds(item);
    const peopleCount = normalizePeopleCount(item);
    const [row] = await db`
      INSERT INTO productivity_matrix (material_name, material_code, material_codes, machine_name, machine_priority, people_count, output_qty, output_unit, time_minutes, time_seconds, notes, active)
      VALUES (${item.materialName}, ${primaryCode}, ${materialCodes}, ${item.machineName}, ${normalizePriority(item)}, ${peopleCount}, ${Number(item.outputQty)}, ${item.outputUnit || 'un'}, ${timeSeconds / 60}, ${timeSeconds}, ${item.notes || null}, ${item.active !== false})
      RETURNING *
    `;
    await recordAuditLog(db, {
      user: req.user,
      action: 'Alterações na matriz de produtividade',
      module: 'Matriz de Produtividade',
      description: `Cadastrou produtividade de ${row.material_name} na máquina ${row.machine_name}`,
      recordRef: row.id
    });
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requirePermission('matrix:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    const item = req.body;
    const materialCodes = normalizeCodes(item);
    const primaryCode = materialCodes[0] || null;
    const timeSeconds = normalizeSeconds(item);
    const peopleCount = normalizePeopleCount(item);
    const [row] = await db`
      UPDATE productivity_matrix
      SET material_name = ${item.materialName},
          material_code = ${primaryCode},
          material_codes = ${materialCodes},
          machine_name = ${item.machineName},
          machine_priority = ${normalizePriority(item)},
          people_count = ${peopleCount},
          output_qty = ${Number(item.outputQty)},
          output_unit = ${item.outputUnit || 'un'},
          time_minutes = ${timeSeconds / 60},
          time_seconds = ${timeSeconds},
          notes = ${item.notes || null},
          active = ${item.active !== false},
          updated_at = now()
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    await recordAuditLog(db, {
      user: req.user,
      action: 'Alterações na matriz de produtividade',
      module: 'Matriz de Produtividade',
      description: `Editou produtividade de ${row.material_name} na máquina ${row.machine_name}`,
      recordRef: row.id
    });
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requirePermission('matrix:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    const [row] = await db`UPDATE productivity_matrix SET active = false, updated_at = now() WHERE id = ${req.params.id} RETURNING *`;
    if (row) {
      await recordAuditLog(db, {
        user: req.user,
        action: 'Alterações na matriz de produtividade',
        module: 'Matriz de Produtividade',
        description: `Desativou produtividade de ${row.material_name} na máquina ${row.machine_name}`,
        recordRef: row.id
      });
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
