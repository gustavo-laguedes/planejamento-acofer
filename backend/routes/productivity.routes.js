import { Router } from 'express';
import { requireDb } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const db = requireDb();
    const search = `%${req.query.search || ''}%`;
    const rows = await db`
      SELECT *
      FROM productivity_matrix
      WHERE (${req.query.search || ''} = '' OR material_name ILIKE ${search} OR machine_name ILIKE ${search} OR material_code ILIKE ${search})
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
    const [row] = await db`
      INSERT INTO productivity_matrix (material_name, material_code, machine_name, people_count, output_qty, output_unit, time_minutes, notes, active)
      VALUES (${item.materialName}, ${item.materialCode || null}, ${item.machineName}, ${Number(item.peopleCount)}, ${Number(item.outputQty)}, ${item.outputUnit || 'un'}, ${Number(item.timeMinutes)}, ${item.notes || null}, ${item.active !== false})
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
    const [row] = await db`
      UPDATE productivity_matrix
      SET material_name = ${item.materialName},
          material_code = ${item.materialCode || null},
          machine_name = ${item.machineName},
          people_count = ${Number(item.peopleCount)},
          output_qty = ${Number(item.outputQty)},
          output_unit = ${item.outputUnit || 'un'},
          time_minutes = ${Number(item.timeMinutes)},
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
