import { Router } from 'express';
import { requireDb } from '../db.js';

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
  return Number(item.timeMinutes || 0) * 60;
}

router.get('/', async (req, res, next) => {
  try {
    const db = requireDb();
    const search = `%${req.query.search || ''}%`;
    const rows = await db`
      SELECT *
      FROM productivity_matrix
      WHERE (${req.query.search || ''} = ''
        OR material_name ILIKE ${search}
        OR machine_name ILIKE ${search}
        OR material_code ILIKE ${search}
        OR array_to_string(COALESCE(material_codes, ARRAY[]::text[]), ', ') ILIKE ${search})
      ORDER BY active DESC, material_name, machine_name, people_count
    `;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const db = requireDb();
    const item = req.body;
    const materialCodes = normalizeCodes(item);
    const primaryCode = materialCodes[0] || null;
    const timeSeconds = normalizeSeconds(item);
    const [row] = await db`
      INSERT INTO productivity_matrix (material_name, material_code, material_codes, machine_name, people_count, output_qty, output_unit, time_minutes, time_seconds, notes, active)
      VALUES (${item.materialName}, ${primaryCode}, ${materialCodes}, ${item.machineName}, ${Number(item.peopleCount)}, ${Number(item.outputQty)}, ${item.outputUnit || 'un'}, ${timeSeconds / 60}, ${timeSeconds}, ${item.notes || null}, ${item.active !== false})
      RETURNING *
    `;
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const db = requireDb();
    const item = req.body;
    const materialCodes = normalizeCodes(item);
    const primaryCode = materialCodes[0] || null;
    const timeSeconds = normalizeSeconds(item);
    const [row] = await db`
      UPDATE productivity_matrix
      SET material_name = ${item.materialName},
          material_code = ${primaryCode},
          material_codes = ${materialCodes},
          machine_name = ${item.machineName},
          people_count = ${Number(item.peopleCount)},
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
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const db = requireDb();
    await db`UPDATE productivity_matrix SET active = false, updated_at = now() WHERE id = ${req.params.id}`;
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
