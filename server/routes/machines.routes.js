import { Router } from 'express';
import { requireDb } from '../db.js';

const router = Router();

function normalizeName(value) {
  return String(value || '').trim();
}

router.get('/', async (req, res, next) => {
  try {
    const db = requireDb();
    const search = `%${req.query.search || ''}%`;
    const rows = await db`
      SELECT m.*, l.name AS location_name
      FROM machines m
      JOIN locations l ON l.id = m.location_id
      WHERE (${req.query.search || ''} = '' OR m.name ILIKE ${search} OR l.name ILIKE ${search})
      ORDER BY m.active DESC, m.name, l.name
    `;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const name = normalizeName(req.body.name);
    const locationId = Number(req.body.locationId);
    if (!name) return res.status(400).json({ error: 'Nome da maquina e obrigatorio.' });
    if (!locationId) return res.status(400).json({ error: 'Local da maquina e obrigatorio.' });

    const db = requireDb();
    const [location] = await db`SELECT id FROM locations WHERE id = ${locationId}`;
    if (!location) return res.status(400).json({ error: 'Local informado não existe.' });

    const [row] = await db`
      INSERT INTO machines (name, location_id, active)
      VALUES (${name}, ${locationId}, ${req.body.active !== false})
      RETURNING *
    `;
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const name = normalizeName(req.body.name);
    const locationId = Number(req.body.locationId);
    if (!name) return res.status(400).json({ error: 'Nome da maquina e obrigatorio.' });
    if (!locationId) return res.status(400).json({ error: 'Local da maquina e obrigatorio.' });

    const db = requireDb();
    const [location] = await db`SELECT id FROM locations WHERE id = ${locationId}`;
    if (!location) return res.status(400).json({ error: 'Local informado não existe.' });

    const [row] = await db`
      UPDATE machines
      SET name = ${name},
          location_id = ${locationId},
          active = ${req.body.active !== false},
          updated_at = now()
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!row) return res.status(404).json({ error: 'Máquina não encontrada.' });
    res.json(row);
  } catch (error) {
    next(error);
  }
});

export default router;
