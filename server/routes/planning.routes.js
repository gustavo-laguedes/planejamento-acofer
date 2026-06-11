import { Router } from 'express';
import { requireDb } from '../db.js';
import { buildPlan } from '../../services/planning.service.js';
import { createPlanningPdf } from '../../services/pdf.service.js';

const router = Router();

async function planningContext(db, payload = {}) {
  const materialId = Number(payload.materialId);
  const materialCode = String(payload.materialCode || '').trim();
  const [materials, inputs, stockRows, inventoryRows, productionRows, matrixRows, locations] = await Promise.all([
    db`SELECT * FROM materials WHERE active = true ORDER BY name`,
    db`SELECT * FROM material_inputs`,
    db`SELECT establishment, product_code, old_product_code, fiscal_balance_unit FROM stock_snapshot`,
    db`
      SELECT DISTINCT ON (material_id, location_id)
             material_id, location_id, adjustment_qty, updated_at
      FROM stock_location_adjustments
      ORDER BY material_id, location_id, updated_at DESC, id DESC
    `,
    db`SELECT material_id, quantity FROM production_launches WHERE material_id IS NOT NULL`,
    db`SELECT * FROM productivity_matrix WHERE active = true ORDER BY updated_at DESC`,
    db`SELECT * FROM locations WHERE active = true ORDER BY name`
  ]);
  const materialsById = new Map(materials.map(material => [String(material.id), material]));
  const locationsById = new Map(locations.map(location => [String(location.id), location]));
  const inputsByMaterialId = new Map();
  for (const input of inputs) {
    const key = String(input.material_id);
    if (!inputsByMaterialId.has(key)) inputsByMaterialId.set(key, []);
    inputsByMaterialId.get(key).push(input);
  }
  const material = materialId
    ? materialsById.get(String(materialId))
    : materials.find(item =>
        item.name === payload.materialName
        || (Array.isArray(item.codes) && item.codes.some(code => String(code) === materialCode))
      );
  return { material, materialsById, inputsByMaterialId, locationsById, stockRows, inventoryRows, productionRows, matrixRows };
}

router.post('/simulate', async (req, res, next) => {
  try {
    const db = requireDb();
    res.json(buildPlan(req.body, await planningContext(db, req.body)));
  } catch (error) {
    next(error);
  }
});

router.post('/plans', async (req, res, next) => {
  try {
    const db = requireDb();
    const plan = buildPlan(req.body, await planningContext(db, req.body));
    const saved = await db.begin(async tx => {
      const [created] = await tx`
        INSERT INTO production_plans (
          code, material_name, material_code, machine_name, people_count, planned_qty,
          planned_unit, hours_per_day, start_date, end_date, status, date_mode, schedule_tree, operations, user_id
        )
        VALUES (
          ${plan.code}, ${plan.summary.materialName}, ${plan.summary.materialCode}, ${plan.summary.machineName || ''},
          ${Number(plan.summary.peopleCount || 0)}, ${plan.summary.plannedQty}, ${plan.summary.plannedUnit},
          ${plan.summary.hoursPerDay}, ${plan.summary.startDate}, ${plan.summary.endDate}, 'planned', ${plan.summary.dateMode},
          ${JSON.stringify(plan.tree)}::jsonb, ${JSON.stringify(plan.operations)}::jsonb, NULL
        )
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
    res.status(201).json({ plan: saved, days: plan.days, tree: plan.tree, operations: plan.operations });
  } catch (error) {
    next(error);
  }
});

router.get('/plans', async (req, res, next) => {
  try {
    const db = requireDb();
    const rows = await db`
      SELECT id, code, material_name, material_code, planned_qty, planned_unit, hours_per_day, start_date, end_date, status, created_at
      FROM production_plans
      ORDER BY created_at DESC
      LIMIT 100
    `;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/plans/:id', async (req, res, next) => {
  try {
    const db = requireDb();
    const [plan] = await db`SELECT * FROM production_plans WHERE id = ${req.params.id}`;
    if (!plan) return res.status(404).json({ error: 'Plano nao encontrado.' });
    const days = await db`SELECT * FROM production_plan_days WHERE plan_id = ${req.params.id} ORDER BY planned_date, id`;
    res.json({ plan, days, tree: plan.schedule_tree, operations: plan.operations });
  } catch (error) {
    next(error);
  }
});

router.post('/plans/:id/cancel', async (req, res, next) => {
  try {
    const db = requireDb();
    const [row] = await db`
      UPDATE production_plans
      SET status = 'canceled', canceled_at = now(), cancel_reason = ${req.body.reason || 'Cancelado pelo usuario'}
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!row) return res.status(404).json({ error: 'Plano nao encontrado.' });
    res.json(row);
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
    const pdf = await createPlanningPdf(plan, days, plan.schedule_tree, plan.operations);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=planejamento-${plan.code || plan.id}.pdf`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

export default router;
