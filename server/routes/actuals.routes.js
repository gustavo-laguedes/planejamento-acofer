import { Router } from 'express';
import { requireDb } from '../db.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const db = requireDb();
    const item = req.body;
    const [row] = await db`
      INSERT INTO production_actuals (production_date, material_name, material_code, machine_name, actual_qty, actual_unit, notes)
      VALUES (${item.productionDate}, ${item.materialName}, ${item.materialCode || null}, ${item.machineName || null}, ${Number(item.actualQty || item.quantity)}, ${item.actualUnit || item.primaryUnit || 'un'}, ${item.notes || null})
      RETURNING *
    `;
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.post('/launches', async (req, res, next) => {
  try {
    const db = requireDb();
    const item = req.body;
    const materialId = Number(item.materialId);
    const quantity = Number(item.quantity);
    if (!materialId || !quantity) return res.status(400).json({ error: 'Material e quantidade sao obrigatorios.' });
    const [material] = await db`SELECT * FROM materials WHERE id = ${materialId}`;
    if (!material) return res.status(404).json({ error: 'Material nao encontrado.' });
    const materialCode = Array.isArray(material.codes) ? material.codes[0] || null : null;
    const secondaryQty = Number((quantity * Number(material.primary_to_secondary_factor || 1)).toFixed(3));

    const row = await db.begin(async tx => {
      const [launch] = await tx`
        INSERT INTO production_launches (
          production_date, material_id, material_name, material_code, quantity, primary_unit,
          secondary_qty, secondary_unit, machine_name, people_count, planning_code, notes, user_id
        )
        VALUES (
          ${item.productionDate}, ${material.id}, ${material.name}, ${materialCode}, ${quantity}, ${material.primary_unit},
          ${secondaryQty}, ${material.secondary_unit}, ${item.machineName || null}, ${Number(item.peopleCount || 0) || null},
          ${item.planningCode || null}, ${item.notes || null}, NULL
        )
        RETURNING *
      `;
      await tx`
        INSERT INTO production_actuals (production_date, material_name, material_code, machine_name, actual_qty, actual_unit, notes)
        VALUES (${item.productionDate}, ${material.name}, ${materialCode}, ${item.machineName || null}, ${quantity}, ${material.primary_unit}, ${item.notes || null})
      `;
      return launch;
    });
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.get('/launches', async (req, res, next) => {
  try {
    const db = requireDb();
    const rows = await db`
      SELECT *
      FROM production_launches
      ORDER BY production_date DESC, created_at DESC
      LIMIT 200
    `;
    res.json(rows);
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
        SELECT material_name, SUM(actual_qty) AS actual_qty
        FROM production_actuals
        GROUP BY material_name
      )
      SELECT p.code AS planning_code,
             MIN(d.planned_date) AS start_date,
             MAX(d.planned_date) AS end_date,
             d.material_name,
             d.machine_name,
             SUM(d.planned_qty) AS planned_qty,
             COALESCE(a.actual_qty, 0) AS actual_qty,
             COALESCE(a.actual_qty, 0) - SUM(d.planned_qty) AS difference,
             CASE WHEN SUM(d.planned_qty) = 0 THEN 0 ELSE ROUND((COALESCE(a.actual_qty, 0) / SUM(d.planned_qty)) * 100, 2) END AS percent_done,
             CASE
               WHEN p.status = 'canceled' THEN 'Cancelado'
               WHEN COALESCE(a.actual_qty, 0) >= SUM(d.planned_qty) THEN 'Concluido'
               WHEN COALESCE(a.actual_qty, 0) = 0 THEN 'Pendente'
               ELSE 'Em andamento'
             END AS status
      FROM production_plan_days d
      JOIN production_plans p ON p.id = d.plan_id
      LEFT JOIN actuals a ON a.material_name = d.material_name
      WHERE (${req.query.planningCode || ''} = '' OR p.code ILIKE ${`%${req.query.planningCode || ''}%`})
        AND (${req.query.material || ''} = '' OR d.material_name ILIKE ${`%${req.query.material || ''}%`})
        AND (${req.query.machine || ''} = '' OR d.machine_name ILIKE ${`%${req.query.machine || ''}%`})
        AND (${req.query.startDate || ''} = '' OR d.planned_date >= ${req.query.startDate || '1900-01-01'})
        AND (${req.query.endDate || ''} = '' OR d.planned_date <= ${req.query.endDate || '2999-12-31'})
      GROUP BY p.code, p.status, d.material_name, d.machine_name, a.actual_qty
      ORDER BY MAX(d.planned_date) DESC, d.material_name
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
    const lateMaterials = rows.filter(row => ['Pendente', 'Em andamento'].includes(row.status)).length;
    res.json({ summary: { ...summary, late_materials: lateMaterials }, rows });
  } catch (error) {
    next(error);
  }
});

export default router;
