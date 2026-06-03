import { Router } from 'express';
import { requireDb } from '../db.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const db = requireDb();
    const item = req.body;
    const [row] = await db`
      INSERT INTO production_actuals (production_date, material_name, material_code, machine_name, actual_qty, actual_unit, notes)
      VALUES (${item.productionDate}, ${item.materialName}, ${item.materialCode || null}, ${item.machineName || null}, ${Number(item.actualQty)}, ${item.actualUnit || 'un'}, ${item.notes || null})
      RETURNING *
    `;
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const db = requireDb();
    const rows = await db`
      SELECT *
      FROM production_actuals
      ORDER BY production_date DESC, created_at DESC
      LIMIT 200
    `;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/tracking', async (req, res, next) => {
  try {
    const db = requireDb();
    const rows = await db`
      WITH actuals AS (
        SELECT production_date, material_name, SUM(actual_qty) AS actual_qty
        FROM production_actuals
        GROUP BY production_date, material_name
      )
      SELECT d.planned_date,
             d.material_name,
             d.planned_qty,
             COALESCE(a.actual_qty, 0) AS actual_qty,
             COALESCE(a.actual_qty, 0) - d.planned_qty AS difference,
             CASE
               WHEN COALESCE(a.actual_qty, 0) = d.planned_qty THEN 'Dentro do planejado'
               WHEN COALESCE(a.actual_qty, 0) < d.planned_qty THEN 'Abaixo do planejado'
               ELSE 'Acima do planejado'
             END AS status
      FROM production_plan_days d
      LEFT JOIN actuals a ON a.production_date = d.planned_date AND a.material_name = d.material_name
      ORDER BY d.planned_date DESC, d.material_name
      LIMIT 300
    `;

    const [summary] = await db`
      WITH planned AS (SELECT COALESCE(SUM(planned_qty), 0) AS qty FROM production_plan_days),
           actual AS (SELECT COALESCE(SUM(actual_qty), 0) AS qty FROM production_actuals)
      SELECT planned.qty AS planned_total,
             actual.qty AS actual_total,
             CASE WHEN planned.qty = 0 THEN 0 ELSE ROUND((actual.qty / planned.qty) * 100, 2) END AS adherence_percent
      FROM planned, actual
    `;
    const lateMaterials = rows.filter(row => row.status === 'Abaixo do planejado').length;
    res.json({ summary: { ...summary, late_materials: lateMaterials }, rows });
  } catch (error) {
    next(error);
  }
});

export default router;
