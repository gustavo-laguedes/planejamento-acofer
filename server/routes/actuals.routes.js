import { Router } from 'express';
import { requireDb } from '../db.js';

const router = Router();

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeLots(value) {
  return Array.isArray(value)
    ? value.map(item => ({
        quantity: toNumber(item.quantity),
        primaryUnit: String(item.primaryUnit || item.primary_unit || '').trim(),
        secondaryUnit: String(item.secondaryUnit || item.secondary_unit || '').trim(),
        lot: String(item.lot || item.generatedLot || '').trim()
      })).filter(item => item.quantity > 0)
    : [];
}

function firstCode(material) {
  return Array.isArray(material?.codes) ? material.codes[0] || null : null;
}

async function materialById(db, id) {
  if (!Number(id)) return null;
  const [material] = await db`SELECT * FROM materials WHERE id = ${Number(id)}`;
  return material || null;
}

function launchStatus(row) {
  return String(row?.status || '').toLowerCase() === 'canceled' ? 'canceled' : 'launched';
}

function launchPayload(item, material, inputMaterial, lots) {
  const quantity = Number(lots.reduce((sum, lot) => sum + lot.quantity, 0).toFixed(3));
  const secondaryQty = Number((quantity * Number(material.primary_to_secondary_factor || 1)).toFixed(3));
  const producedLots = lots.map(lot => ({
    quantity: lot.quantity,
    primaryUnit: lot.primaryUnit || material.primary_unit,
    secondaryUnit: lot.secondaryUnit || material.secondary_unit,
    lot: lot.lot
  }));
  return {
    quantity,
    secondaryQty,
    producedLots,
    materialCode: firstCode(material),
    inputMaterialId: inputMaterial?.id || null,
    inputMaterialName: inputMaterial?.name || null,
    inputMaterialCode: firstCode(inputMaterial),
    consumedLot: item.consumedLot || null,
    benefitNumber: item.benefitNumber || null
  };
}

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
    const material = await materialById(db, item.materialId);
    const inputMaterial = await materialById(db, item.inputMaterialId);
    const lots = normalizeLots(item.producedLots?.length ? item.producedLots : [{ quantity: item.quantity, lot: item.generatedLot }]);
    if (!material || !lots.length) return res.status(400).json({ error: 'Material produzido e quantidade são obrigatórios.' });
    const launchData = launchPayload(item, material, inputMaterial, lots);

    const row = await db.begin(async tx => {
      const [launch] = await tx`
        INSERT INTO production_launches (
          production_date, material_id, material_name, material_code, quantity, primary_unit,
          secondary_qty, secondary_unit, machine_name, people_count, planning_code, notes, user_id,
          input_material_id, input_material_name, input_material_code, consumed_lot, produced_lots,
          benefit_number, status
        )
        VALUES (
          ${item.productionDate}, ${material.id}, ${material.name}, ${launchData.materialCode}, ${launchData.quantity}, ${material.primary_unit},
          ${launchData.secondaryQty}, ${material.secondary_unit}, ${item.machineName || null}, ${Number(item.peopleCount || 0) || null},
          ${item.planningCode || null}, ${item.notes || null}, NULL,
          ${launchData.inputMaterialId}, ${launchData.inputMaterialName}, ${launchData.inputMaterialCode}, ${launchData.consumedLot},
          ${JSON.stringify(launchData.producedLots)}::jsonb, ${launchData.benefitNumber}, 'launched'
        )
        RETURNING *
      `;
      await tx`
        INSERT INTO production_actuals (production_date, material_name, material_code, machine_name, actual_qty, actual_unit, notes)
        VALUES (${item.productionDate}, ${material.name}, ${launchData.materialCode}, ${item.machineName || null}, ${launchData.quantity}, ${material.primary_unit}, ${item.notes || null})
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
    res.json(rows.map(row => ({ ...row, status: launchStatus(row) })));
  } catch (error) {
    next(error);
  }
});

router.get('/launches/:id', async (req, res, next) => {
  try {
    const db = requireDb();
    const [row] = await db`SELECT * FROM production_launches WHERE id = ${req.params.id}`;
    if (!row) return res.status(404).json({ error: 'Produção não encontrada.' });
    res.json({ ...row, status: launchStatus(row) });
  } catch (error) {
    next(error);
  }
});

router.put('/launches/:id', async (req, res, next) => {
  try {
    const db = requireDb();
    const item = req.body;
    const [current] = await db`SELECT * FROM production_launches WHERE id = ${req.params.id}`;
    if (!current) return res.status(404).json({ error: 'Produção não encontrada.' });
    const material = await materialById(db, item.materialId);
    const inputMaterial = await materialById(db, item.inputMaterialId);
    const lots = normalizeLots(item.producedLots?.length ? item.producedLots : [{ quantity: item.quantity, lot: item.generatedLot }]);
    if (!material || !lots.length) return res.status(400).json({ error: 'Material produzido e quantidade são obrigatórios.' });
    const launchData = launchPayload(item, material, inputMaterial, lots);

    const [row] = await db`
      UPDATE production_launches
      SET production_date = ${item.productionDate},
          material_id = ${material.id},
          material_name = ${material.name},
          material_code = ${launchData.materialCode},
          quantity = ${launchData.quantity},
          primary_unit = ${material.primary_unit},
          secondary_qty = ${launchData.secondaryQty},
          secondary_unit = ${material.secondary_unit},
          machine_name = ${item.machineName || null},
          people_count = ${Number(item.peopleCount || 0) || null},
          planning_code = ${item.planningCode || null},
          notes = ${item.notes || null},
          input_material_id = ${launchData.inputMaterialId},
          input_material_name = ${launchData.inputMaterialName},
          input_material_code = ${launchData.inputMaterialCode},
          consumed_lot = ${launchData.consumedLot},
          produced_lots = ${JSON.stringify(launchData.producedLots)}::jsonb,
          benefit_number = ${launchData.benefitNumber}
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    res.json({ ...row, status: launchStatus(row) });
  } catch (error) {
    next(error);
  }
});

router.post('/launches/:id/cancel', async (req, res, next) => {
  try {
    const db = requireDb();
    const [row] = await db`
      UPDATE production_launches
      SET status = 'canceled',
          canceled_at = now(),
          cancel_reason = ${req.body.reason || 'Cancelado pelo usuário'}
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!row) return res.status(404).json({ error: 'Produção não encontrada.' });
    res.json({ ...row, status: launchStatus(row) });
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
               WHEN COALESCE(a.actual_qty, 0) >= SUM(d.planned_qty) THEN 'Concluído'
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
