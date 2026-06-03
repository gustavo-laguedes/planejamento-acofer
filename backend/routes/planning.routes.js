import { Router } from 'express';
import { requireDb } from '../db.js';
import { buildPlan } from '../services/planning.service.js';
import { createPlanningPdf } from '../services/pdf.service.js';

const router = Router();

async function findMatrixEntry(db, payload) {
  const [entry] = await db`
    SELECT *
    FROM productivity_matrix
    WHERE active = true
      AND material_name ILIKE ${payload.materialName}
      AND (${payload.materialCode || ''} = '' OR material_code = ${payload.materialCode || ''} OR ${payload.materialCode || ''} = ANY(material_codes))
      AND machine_name = ${payload.machineName}
      AND people_count = ${Number(payload.peopleCount)}
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  return entry;
}

router.post('/simulate', async (req, res, next) => {
  try {
    const db = requireDb();
    const entry = await findMatrixEntry(db, req.body);
    res.json(buildPlan(req.body, entry));
  } catch (error) {
    next(error);
  }
});

router.post('/plans', async (req, res, next) => {
  try {
    const db = requireDb();
    const entry = await findMatrixEntry(db, req.body);
    const plan = buildPlan(req.body, entry);
    const saved = await db.begin(async tx => {
      const [created] = await tx`
        INSERT INTO production_plans (material_name, material_code, machine_name, people_count, planned_qty, planned_unit, start_date, end_date, status)
        VALUES (${req.body.materialName}, ${req.body.materialCode || null}, ${req.body.machineName}, ${Number(req.body.peopleCount)}, ${Number(req.body.plannedQty)}, ${plan.summary.plannedUnit}, ${req.body.startDate}, ${plan.summary.endDate}, 'planned')
        RETURNING *
      `;
      for (const day of plan.days) {
        await tx`
          INSERT INTO production_plan_days (plan_id, planned_date, material_name, material_code, machine_name, people_count, planned_qty, planned_unit)
          VALUES (${created.id}, ${day.planned_date}, ${day.material_name}, ${day.material_code}, ${day.machine_name}, ${day.people_count}, ${day.planned_qty}, ${day.planned_unit})
        `;
      }
      return created;
    });
    res.status(201).json({ plan: saved, days: plan.days });
  } catch (error) {
    next(error);
  }
});

router.get('/plans', async (req, res, next) => {
  try {
    const db = requireDb();
    const rows = await db`
      SELECT *
      FROM production_plans
      ORDER BY created_at DESC
      LIMIT 100
    `;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/days', async (req, res, next) => {
  try {
    const db = requireDb();
    const rows = await db`
      SELECT *
      FROM production_plan_days
      ORDER BY planned_date ASC, material_name
      LIMIT 500
    `;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/plans/:id/pdf', async (req, res, next) => {
  try {
    const db = requireDb();
    const [plan] = await db`SELECT * FROM production_plans WHERE id = ${req.params.id}`;
    if (!plan) return res.status(404).json({ error: 'Plano nao encontrado.' });
    const days = await db`SELECT * FROM production_plan_days WHERE plan_id = ${req.params.id} ORDER BY planned_date`;
    const pdf = await createPlanningPdf(plan, days);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=programacao-${plan.id}.pdf`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

export default router;
