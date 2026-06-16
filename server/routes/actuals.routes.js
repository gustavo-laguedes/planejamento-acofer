import { Router } from 'express';
import { requireDb } from '../db.js';
import { requirePermission } from './middleware.js';
import { recordAuditLog } from '../audit.js';

const router = Router();

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeLots(value) {
  return Array.isArray(value)
    ? value.map(item => ({
        quantity: toNumber(item.quantity),
        secondaryQty: toNumber(item.secondaryQty ?? item.secondary_qty),
        primaryUnit: String(item.primaryUnit || item.primary_unit || '').trim(),
        secondaryUnit: String(item.secondaryUnit || item.secondary_unit || '').trim(),
        lot: String(item.lot || item.generatedLot || '').trim(),
        benefitNumber: String(item.benefitNumber || item.benefit_number || '').trim()
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

async function consumedInputPayload(db, item) {
  const source = Array.isArray(item.consumedInputs) ? item.consumedInputs : [];
  const ids = [...new Set(source.map(input => Number(input.materialId || input.inputMaterialId || input.id)).filter(Boolean))];
  if (!ids.length) return [];
  const materials = await db`SELECT id, name, codes FROM materials WHERE id = ANY(${ids})`;
  const byId = new Map(materials.map(material => [String(material.id), material]));
  return source.map(input => {
    const materialId = Number(input.materialId || input.inputMaterialId || input.id);
    const material = byId.get(String(materialId));
    return {
      materialId,
      materialName: material?.name || input.materialName || null,
      materialCode: firstCode(material) || input.materialCode || null,
      lot: String(input.lot || input.consumedLot || '').trim()
    };
  }).filter(input => input.materialId);
}

function launchStatus(row) {
  return String(row?.status || '').toLowerCase() === 'canceled' ? 'canceled' : 'launched';
}

async function hasColumn(db, tableName, columnName) {
  const [row] = await db`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = ${columnName}
    LIMIT 1
  `;
  return Boolean(row);
}

function launchPayload(item, material, consumedInputs, lots) {
  const quantity = Number(lots.reduce((sum, lot) => sum + lot.quantity, 0).toFixed(3));
  const secondaryQty = Number((quantity * Number(material.primary_to_secondary_factor || 1)).toFixed(3));
  const producedLots = lots.map(lot => ({
    quantity: lot.quantity,
    secondaryQty: lot.secondaryQty || Number((lot.quantity * Number(material.primary_to_secondary_factor || 1)).toFixed(3)),
    primaryUnit: lot.primaryUnit || material.primary_unit,
    secondaryUnit: lot.secondaryUnit || material.secondary_unit,
    lot: lot.lot,
    benefitNumber: lot.benefitNumber || null
  }));
  return {
    quantity,
    secondaryQty,
    producedLots,
    materialCode: firstCode(material),
    productionModelName: String(item.productionModelName || '').trim() || null,
    consumedInputs,
    inputMaterialName: consumedInputs[0]?.materialName || null,
    inputMaterialCode: consumedInputs[0]?.materialCode || null,
    consumedLot: consumedInputs.length === 1 ? consumedInputs[0].lot || null : null
  };
}

function materialResponse(row) {
  const grouped = new Map();
  for (const item of row.production_model_items || []) {
    const modelName = item.modelName || 'Modelo padrão';
    if (!grouped.has(modelName)) grouped.set(modelName, []);
    grouped.get(modelName).push({
      id: item.inputMaterialId,
      inputMaterialId: item.inputMaterialId,
      name: item.materialName,
      qtyPerOutput: item.qtyPerOutput || 1
    });
  }
  return {
    ...row,
    production_models: [...grouped.entries()].map(([name, inputMaterials]) => ({ name, inputMaterials }))
  };
}

router.get('/lookups', requirePermission('launches:read'), async (req, res, next) => {
  try {
    const db = requireDb();
    const [materials, machines, matrix] = await Promise.all([
      db`
        SELECT m.*,
               COALESCE(
                 json_agg(json_build_object('modelName', COALESCE(mi.production_model_name, 'Modelo padrão'), 'inputMaterialId', i.id, 'materialName', i.name, 'qtyPerOutput', mi.qty_per_output) ORDER BY COALESCE(mi.production_model_name, 'Modelo padrão'), i.name)
                 FILTER (WHERE i.id IS NOT NULL),
                 '[]'::json
               ) AS production_model_items
        FROM materials m
        LEFT JOIN material_inputs mi ON mi.material_id = m.id
        LEFT JOIN materials i ON i.id = mi.input_material_id
        GROUP BY m.id
        ORDER BY m.active DESC, m.name
      `,
      db`
        SELECT m.*, l.name AS location_name
        FROM machines m
        JOIN locations l ON l.id = m.location_id
        ORDER BY m.active DESC, m.name, l.name
      `,
      db`
        SELECT *
        FROM productivity_matrix
        ORDER BY active DESC, material_name, machine_name, people_count
      `
    ]);
    res.json({ materials: materials.map(materialResponse), machines, matrix });
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission('launches:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    const item = req.body;
    const [row] = await db`
      INSERT INTO production_actuals (production_date, material_name, material_code, machine_name, actual_qty, actual_unit, notes)
      VALUES (${item.productionDate}, ${item.materialName}, ${item.materialCode || null}, ${item.machineName || null}, ${Number(item.actualQty || item.quantity)}, ${item.actualUnit || item.primaryUnit || 'un'}, ${item.notes || null})
      RETURNING *
    `;
    await recordAuditLog(db, {
      user: req.user,
      action: 'Lançamento de produção',
      module: 'Produção',
      description: `Lançou ${row.actual_qty} ${row.actual_unit} do material ${row.material_code || row.material_name}`,
      recordRef: row.id
    });
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.post('/launches', requirePermission('launches:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    const item = req.body;
    const material = await materialById(db, item.materialId);
    const consumedInputs = await consumedInputPayload(db, item);
    const lots = normalizeLots(item.producedLots?.length ? item.producedLots : [{ quantity: item.quantity, lot: item.generatedLot }]);
    if (!material || !lots.length) return res.status(400).json({ error: 'Material produzido e quantidade são obrigatórios.' });
    const launchData = launchPayload(item, material, consumedInputs, lots);

    const row = await db.begin(async tx => {
      const [launch] = await tx`
        INSERT INTO production_launches (
          production_date, material_id, material_name, material_code, quantity, primary_unit,
          secondary_qty, secondary_unit, machine_name, people_count, planning_code, notes, user_id,
          production_model_name, consumed_inputs, input_material_name, input_material_code, consumed_lot,
          produced_lots, status
        )
        VALUES (
          ${item.productionDate}, ${material.id}, ${material.name}, ${launchData.materialCode}, ${launchData.quantity}, ${material.primary_unit},
          ${launchData.secondaryQty}, ${material.secondary_unit}, ${item.machineName || null}, ${Number(item.peopleCount || 0) || null},
          ${item.planningCode || null}, ${item.notes || null}, NULL,
          ${launchData.productionModelName}, ${tx.json(launchData.consumedInputs)},
          ${launchData.inputMaterialName}, ${launchData.inputMaterialCode}, ${launchData.consumedLot},
          ${tx.json(launchData.producedLots)}, 'launched'
        )
        RETURNING *
      `;
      await tx`
        INSERT INTO production_actuals (production_date, material_name, material_code, machine_name, actual_qty, actual_unit, notes)
        VALUES (${item.productionDate}, ${material.name}, ${launchData.materialCode}, ${item.machineName || null}, ${launchData.quantity}, ${material.primary_unit}, ${item.notes || null})
      `;
      return launch;
    });
    await recordAuditLog(db, {
      user: req.user,
      action: 'Lançamento de produção',
      module: 'Produção',
      description: `Lançou ${row.quantity} ${row.primary_unit} do material ${row.material_code || row.material_name}`,
      recordRef: row.id
    });
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.get('/launches', requirePermission('launches:read'), async (req, res, next) => {
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

router.get('/launches/:id', requirePermission('launches:read'), async (req, res, next) => {
  try {
    const db = requireDb();
    const [row] = await db`SELECT * FROM production_launches WHERE id = ${req.params.id}`;
    if (!row) return res.status(404).json({ error: 'Produção não encontrada.' });
    res.json({ ...row, status: launchStatus(row) });
  } catch (error) {
    next(error);
  }
});

router.put('/launches/:id', requirePermission('launches:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    const item = req.body;
    const [current] = await db`SELECT * FROM production_launches WHERE id = ${req.params.id}`;
    if (!current) return res.status(404).json({ error: 'Produção não encontrada.' });
    const material = await materialById(db, item.materialId);
    const consumedInputs = await consumedInputPayload(db, item);
    const lots = normalizeLots(item.producedLots?.length ? item.producedLots : [{ quantity: item.quantity, lot: item.generatedLot }]);
    if (!material || !lots.length) return res.status(400).json({ error: 'Material produzido e quantidade são obrigatórios.' });
    const launchData = launchPayload(item, material, consumedInputs, lots);

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
          production_model_name = ${launchData.productionModelName},
          consumed_inputs = ${db.json(launchData.consumedInputs)},
          input_material_name = ${launchData.inputMaterialName},
          input_material_code = ${launchData.inputMaterialCode},
          consumed_lot = ${launchData.consumedLot},
          produced_lots = ${db.json(launchData.producedLots)},
          benefit_number = ${item.benefitNumber || current.benefit_number || null}
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    await recordAuditLog(db, {
      user: req.user,
      action: 'Edição de lançamento',
      module: 'Produção',
      description: `Editou lançamento ${row.id} do material ${row.material_code || row.material_name}`,
      recordRef: row.id
    });
    res.json({ ...row, status: launchStatus(row) });
  } catch (error) {
    next(error);
  }
});

router.post('/launches/:id/cancel', requirePermission('launches:write'), async (req, res, next) => {
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
    await recordAuditLog(db, {
      user: req.user,
      action: 'Exclusão de lançamento',
      module: 'Produção',
      description: `Cancelou lançamento ${row.id} do material ${row.material_code || row.material_name}`,
      recordRef: row.id
    });
    res.json({ ...row, status: launchStatus(row) });
  } catch (error) {
    next(error);
  }
});

router.get('/', requirePermission('launches:read'), async (req, res, next) => {
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

function trackingPayload(rows) {
  const summary = rows.reduce((acc, row) => {
    acc.planned_total += toNumber(row.planned_qty);
    acc.actual_total += toNumber(row.actual_qty);
    if (['Pendente', 'Em andamento'].includes(row.status)) acc.open_items += 1;
    return acc;
  }, { planned_total: 0, actual_total: 0, open_items: 0 });
  summary.adherence_percent = summary.planned_total === 0
    ? 0
    : Number(((summary.actual_total / summary.planned_total) * 100).toFixed(2));
  summary.planned_total = Number(summary.planned_total.toFixed(2));
  summary.actual_total = Number(summary.actual_total.toFixed(2));
  return { summary, rows };
}

router.get('/tracking', requirePermission('productivity:read'), async (req, res, next) => {
  try {
    const db = requireDb();
    const operationsAvailable = await hasColumn(db, 'production_plans', 'operations');
    if (!operationsAvailable) {
      const rows = await db`
        WITH plan_periods AS (
          SELECT p.code AS planning_code,
                 MIN(d.planned_date) AS start_date,
                 MAX(d.planned_date) AS end_date
          FROM production_plan_days d
          JOIN production_plans p ON p.id = d.plan_id
          GROUP BY p.code
        ),
        filtered_days AS (
          SELECT p.id AS plan_id,
                 p.code AS planning_code,
                 p.status,
                 d.material_name,
                 d.machine_name,
                 MIN(d.planned_date) AS start_date,
                 MAX(d.planned_date) AS end_date,
                 COALESCE(NULLIF(SUM(d.planned_qty), 0), MAX(p.planned_qty) FILTER (WHERE d.material_name = p.material_name), 0) AS planned_qty
          FROM production_plan_days d
          JOIN production_plans p ON p.id = d.plan_id
          WHERE (${req.query.planningCode || ''} = '' OR p.code ILIKE ${`%${req.query.planningCode || ''}%`})
            AND (${req.query.material || ''} = '' OR d.material_name ILIKE ${`%${req.query.material || ''}%`})
            AND (${req.query.machine || ''} = '' OR d.machine_name ILIKE ${`%${req.query.machine || ''}%`})
            AND (${req.query.startDate || ''} = '' OR d.planned_date >= ${req.query.startDate || '1900-01-01'})
            AND (${req.query.endDate || ''} = '' OR d.planned_date <= ${req.query.endDate || '2999-12-31'})
          GROUP BY p.id, p.code, p.status, d.material_name, d.machine_name
        )
        SELECT f.planning_code,
               pp.start_date,
               pp.end_date,
               f.material_name,
               f.machine_name,
               f.planned_qty,
               COALESCE(a.actual_qty, 0) AS actual_qty,
               COALESCE(a.actual_qty, 0) - f.planned_qty AS difference,
               CASE WHEN f.planned_qty = 0 THEN 0 ELSE ROUND((COALESCE(a.actual_qty, 0) / f.planned_qty) * 100, 2) END AS percent_done,
               CASE
                 WHEN f.status = 'canceled' THEN 'Cancelado'
                 WHEN COALESCE(a.actual_qty, 0) >= f.planned_qty THEN 'ConcluÃ­do'
                 WHEN COALESCE(a.actual_qty, 0) = 0 THEN 'Pendente'
                 ELSE 'Em andamento'
               END AS status
        FROM filtered_days f
        JOIN plan_periods pp ON pp.planning_code = f.planning_code
        LEFT JOIN LATERAL (
          SELECT SUM(pa.actual_qty) AS actual_qty
          FROM production_actuals pa
          WHERE pa.material_name = f.material_name
            AND pa.production_date >= f.start_date
            AND pa.production_date <= f.end_date
        ) a ON true
        ORDER BY f.end_date DESC, f.material_name
      `;
      res.json(trackingPayload(rows));
      return;
    }
    const rows = await db`
      WITH plan_periods AS (
        SELECT p.code AS planning_code,
               MIN(d.planned_date) AS start_date,
               MAX(d.planned_date) AS end_date
        FROM production_plan_days d
        JOIN production_plans p ON p.id = d.plan_id
        GROUP BY p.code
      ),
      filtered_days AS (
        SELECT p.id AS plan_id,
               p.code AS planning_code,
               p.status,
               d.material_name,
               d.machine_name,
               MIN(d.planned_date) AS start_date,
               MAX(d.planned_date) AS end_date,
               COALESCE(NULLIF(SUM(d.planned_qty), 0), MAX(operation_qty.planned_qty), 0) AS planned_qty
        FROM production_plan_days d
        JOIN production_plans p ON p.id = d.plan_id
        LEFT JOIN LATERAL (
          SELECT SUM(
            CASE
              WHEN jsonb_typeof(operation.value) = 'object'
                AND NULLIF(TRIM(operation.value->>'produceQty'), '') ~ '^-?[0-9]+([.,][0-9]+)?$'
              THEN REPLACE(TRIM(operation.value->>'produceQty'), ',', '.')::numeric
              ELSE NULL
            END
          ) AS planned_qty
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(p.operations) = 'array' THEN p.operations
              ELSE '[]'::jsonb
            END
          ) AS operation(value)
          WHERE jsonb_typeof(operation.value) = 'object'
            AND operation.value->>'materialName' = d.material_name
            AND COALESCE(operation.value->>'operationType', 'production') <> 'transport'
        ) operation_qty ON true
        WHERE (${req.query.planningCode || ''} = '' OR p.code ILIKE ${`%${req.query.planningCode || ''}%`})
          AND (${req.query.material || ''} = '' OR d.material_name ILIKE ${`%${req.query.material || ''}%`})
          AND (${req.query.machine || ''} = '' OR d.machine_name ILIKE ${`%${req.query.machine || ''}%`})
          AND (${req.query.startDate || ''} = '' OR d.planned_date >= ${req.query.startDate || '1900-01-01'})
          AND (${req.query.endDate || ''} = '' OR d.planned_date <= ${req.query.endDate || '2999-12-31'})
        GROUP BY p.id, p.code, p.status, d.material_name, d.machine_name
      )
      SELECT f.planning_code,
             pp.start_date,
             pp.end_date,
             f.material_name,
             f.machine_name,
             f.planned_qty,
             COALESCE(a.actual_qty, 0) AS actual_qty,
             COALESCE(a.actual_qty, 0) - f.planned_qty AS difference,
             CASE WHEN f.planned_qty = 0 THEN 0 ELSE ROUND((COALESCE(a.actual_qty, 0) / f.planned_qty) * 100, 2) END AS percent_done,
             CASE
               WHEN f.status = 'canceled' THEN 'Cancelado'
               WHEN COALESCE(a.actual_qty, 0) >= f.planned_qty THEN 'Concluído'
               WHEN COALESCE(a.actual_qty, 0) = 0 THEN 'Pendente'
               ELSE 'Em andamento'
             END AS status
      FROM filtered_days f
      JOIN plan_periods pp ON pp.planning_code = f.planning_code
      LEFT JOIN LATERAL (
        SELECT SUM(pa.actual_qty) AS actual_qty
        FROM production_actuals pa
        WHERE pa.material_name = f.material_name
          AND pa.production_date >= f.start_date
          AND pa.production_date <= f.end_date
      ) a ON true
      ORDER BY f.end_date DESC, f.material_name
    `;

    res.json(trackingPayload(rows));
  } catch (error) {
    next(error);
  }
});

export default router;
