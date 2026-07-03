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
        realWeight: toNumber(item.realWeight ?? item.real_weight),
        realWeightUnit: String(item.realWeightUnit || item.real_weight_unit || item.secondaryUnit || item.secondary_unit || '').trim(),
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
  const status = String(row?.status || '').toLowerCase();
  if (isCanceledStatus(status)) return 'canceled';
  if (status === 'cancel_requested') return 'cancel_requested';
  return 'launched';
}

function isCanceledStatus(value) {
  return ['canceled', 'cancelled', 'cancelado', 'cancelada'].includes(String(value || '').trim().toLowerCase());
}

function cancellationRequestPayload(row) {
  const raw = String(row?.cancel_reason || '').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { reason: raw };
  }
}

function cancellationRequestResponse(row) {
  const request = cancellationRequestPayload(row);
  const pending = String(row?.status || '').toLowerCase() === 'cancel_requested';
  const rawReason = String(row?.cancel_reason || '').trim();
  return {
    id: row.id,
    production_id: row.id,
    material_name: row.material_name,
    material_code: row.material_code,
    production_date: row.production_date,
    requested_by: request.requestedBy || request.userName || null,
    requested_by_email: request.requestedByEmail || null,
    requested_at: request.requestedAt || row.canceled_at,
    reason: request.reason || (rawReason.startsWith('{') ? '' : row.cancel_reason) || '',
    status: request.status || (pending ? 'Cancelamento solicitado' : 'Cancelado'),
    pending,
    read: !pending,
    decided_by: request.decidedBy || null,
    decided_at: request.decidedAt || null
  };
}

function canViewCancellationNotifications(user) {
  return ['Super Admin', 'Diretor', 'Gerente', 'PCP'].includes(String(user?.role || '').trim());
}

function launchPayload(item, material, consumedInputs, lots) {
  const quantity = Number(lots.reduce((sum, lot) => sum + lot.quantity, 0).toFixed(3));
  const secondaryQty = Number((quantity * Number(material.primary_to_secondary_factor || 1)).toFixed(3));
  const producedLots = lots.map(lot => ({
    quantity: lot.quantity,
    secondaryQty: lot.secondaryQty || Number((lot.quantity * Number(material.primary_to_secondary_factor || 1)).toFixed(3)),
    primaryUnit: lot.primaryUnit || material.primary_unit,
    secondaryUnit: lot.secondaryUnit || material.secondary_unit,
    realWeight: lot.realWeight,
    realWeightUnit: lot.realWeightUnit || material.secondary_unit,
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

function validateLaunchRequest(item, material, consumedInputs, lots) {
  if (lots.some(lot => !Number.isFinite(lot.realWeight) || lot.realWeight <= 0)) {
    return 'Informe o peso real.';
  }
  const peopleCount = Number(item.peopleCount || 0);
  const hasMissingRequired = !item.productionDate
    || !material
    || !String(item.productionModelName || '').trim()
    || !String(item.machineName || '').trim()
    || !Number.isFinite(peopleCount)
    || peopleCount <= 0
    || consumedInputs.some(input => !String(input.lot || '').trim())
    || !lots.length
    || lots.some(lot => {
      const secondaryQty = lot.secondaryQty || Number((lot.quantity * Number(material.primary_to_secondary_factor || 1)).toFixed(3));
      return !Number.isFinite(lot.quantity)
        || lot.quantity <= 0
        || !String(lot.primaryUnit || material.primary_unit || '').trim()
        || !Number.isFinite(secondaryQty)
        || secondaryQty <= 0
        || !String(lot.secondaryUnit || material.secondary_unit || '').trim()
        || !String(lot.lot || '').trim();
    });
  return hasMissingRequired ? 'Preencha todos os campos obrigatórios.' : '';
}

function normalizeKey(value) {
  return String(value || '').trim().toLocaleLowerCase('pt-BR');
}

function materialTrackingKey(row) {
  return normalizeKey(row.material_name) || normalizeKey(row.material_code);
}

function trackingDateMaterialKey(row, dateField = 'planned_date') {
  return `${materialTrackingKey(row)}|${toDateOnly(row[dateField])}`;
}

function toDateOnly(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function matchesFilter(value, filter) {
  const normalizedFilter = normalizeKey(filter);
  if (!normalizedFilter) return true;
  return normalizeKey(value).includes(normalizedFilter);
}

function isCanceledPlan(row) {
  return isCanceledStatus(row?.status);
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
    const validationError = validateLaunchRequest(item, material, consumedInputs, lots);
    if (validationError) return res.status(400).json({ error: validationError });
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

router.get('/notifications/cancellation-requests', requirePermission('launches:read'), async (req, res, next) => {
  try {
    if (!canViewCancellationNotifications(req.user)) {
      return res.status(403).json({ error: 'Permissão insuficiente para visualizar notificações.' });
    }
    const db = requireDb();
    const rows = await db`
      SELECT *
      FROM production_launches
      WHERE LOWER(COALESCE(status, '')) = 'cancel_requested'
      ORDER BY canceled_at DESC NULLS LAST, created_at DESC
      LIMIT 50
    `;
    res.json(rows.map(cancellationRequestResponse));
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
    if (String(req.user?.role || '').trim() === 'Operador') {
      return res.status(403).json({ error: 'Operador não pode editar produção lançada.' });
    }
    const db = requireDb();
    const item = req.body;
    const [current] = await db`SELECT * FROM production_launches WHERE id = ${req.params.id}`;
    if (!current) return res.status(404).json({ error: 'Produção não encontrada.' });
    const material = await materialById(db, item.materialId);
    const consumedInputs = await consumedInputPayload(db, item);
    const lots = normalizeLots(item.producedLots?.length ? item.producedLots : [{ quantity: item.quantity, lot: item.generatedLot }]);
    const validationError = validateLaunchRequest(item, material, consumedInputs, lots);
    if (validationError) return res.status(400).json({ error: validationError });
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
    if (String(req.user?.role || '').trim() === 'Operador') {
      return res.status(403).json({ error: 'Operador deve solicitar cancelamento em vez de cancelar diretamente.' });
    }
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

router.post('/launches/:id/cancel-request/confirm', requirePermission('launches:write'), async (req, res, next) => {
  try {
    if (String(req.user?.role || '').trim() === 'Operador') {
      return res.status(403).json({ error: 'Operador deve solicitar cancelamento em vez de cancelar diretamente.' });
    }
    const db = requireDb();
    const [current] = await db`SELECT * FROM production_launches WHERE id = ${req.params.id}`;
    if (!current) return res.status(404).json({ error: 'Produção não encontrada.' });
    if (String(current.status || '').toLowerCase() !== 'cancel_requested') {
      return res.status(400).json({ error: 'Produção não possui cancelamento solicitado.' });
    }
    const request = cancellationRequestPayload(current);
    const reason = request.reason || current.cancel_reason || '';
    const requestedBy = request.requestedBy || request.userName || 'Não informado';
    const decidedBy = req.user?.name || req.user?.email || 'Usuário';
    const [row] = await db`
      UPDATE production_launches
      SET status = 'canceled',
          canceled_at = now(),
          cancel_reason = ${JSON.stringify({
            ...request,
            status: 'Cancelamento aprovado',
            reason,
            requestedBy,
            requestedByEmail: request.requestedByEmail || null,
            requestedByRole: request.requestedByRole || null,
            requestedAt: request.requestedAt || current.canceled_at || null,
            decidedBy,
            decidedByEmail: req.user?.email || null,
            decidedByRole: req.user?.role || null,
            decidedAt: new Date().toISOString()
          })}
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    await recordAuditLog(db, {
      user: req.user,
      action: 'Cancelamento de produção aprovado',
      module: 'Produção',
      description: `Material: ${row.material_code || row.material_name}; data da produção: ${row.production_date}; solicitante: ${requestedBy}; decisor: ${decidedBy}; motivo: ${reason}`,
      recordRef: row.id
    });
    res.json({ ...row, status: launchStatus(row) });
  } catch (error) {
    next(error);
  }
});

router.post('/launches/:id/cancel-request/approve-production', requirePermission('launches:write'), async (req, res, next) => {
  try {
    if (String(req.user?.role || '').trim() === 'Operador') {
      return res.status(403).json({ error: 'Operador não pode aprovar produção com cancelamento solicitado.' });
    }
    const db = requireDb();
    const [current] = await db`SELECT * FROM production_launches WHERE id = ${req.params.id}`;
    if (!current) return res.status(404).json({ error: 'Produção não encontrada.' });
    if (String(current.status || '').toLowerCase() !== 'cancel_requested') {
      return res.status(400).json({ error: 'Produção não possui cancelamento solicitado.' });
    }
    const request = cancellationRequestPayload(current);
    const reason = request.reason || current.cancel_reason || '';
    const requestedBy = request.requestedBy || request.userName || 'Não informado';
    const decidedBy = req.user?.name || req.user?.email || 'Usuário';
    const [row] = await db`
      UPDATE production_launches
      SET status = 'launched',
          cancel_reason = ${JSON.stringify({
            ...request,
            status: 'Cancelamento não aprovado',
            reason,
            requestedBy,
            requestedByEmail: request.requestedByEmail || null,
            requestedByRole: request.requestedByRole || null,
            requestedAt: request.requestedAt || current.canceled_at || null,
            decidedBy,
            decidedByEmail: req.user?.email || null,
            decidedByRole: req.user?.role || null,
            decidedAt: new Date().toISOString()
          })}
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    await recordAuditLog(db, {
      user: req.user,
      action: 'Cancelamento de produção não aprovado',
      module: 'Produção',
      description: `Material: ${row.material_code || row.material_name}; data da produção: ${row.production_date}; solicitante: ${requestedBy}; decisor: ${decidedBy}; motivo: ${reason}`,
      recordRef: row.id
    });
    res.json({ ...row, status: launchStatus(row) });
  } catch (error) {
    next(error);
  }
});

router.post('/launches/:id/cancel-request', requirePermission('launches:write'), async (req, res, next) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Motivo do cancelamento é obrigatório.' });

    const db = requireDb();
    const requestedAt = new Date().toISOString();
    const [row] = await db`
      UPDATE production_launches
      SET status = 'cancel_requested',
          canceled_at = now(),
          cancel_reason = ${JSON.stringify({
            status: 'Cancelamento solicitado',
            reason,
            requestedBy: req.user?.name || req.user?.email || 'Usuário',
            requestedByEmail: req.user?.email || null,
            requestedByRole: req.user?.role || null,
            requestedAt
          })}
      WHERE id = ${req.params.id}
        AND LOWER(TRIM(COALESCE(status, ''))) NOT IN ('canceled', 'cancelled', 'cancelado', 'cancelada')
      RETURNING *
    `;
    if (!row) return res.status(404).json({ error: 'Produção não encontrada ou já cancelada.' });
    await recordAuditLog(db, {
      user: req.user,
      action: 'Solicitação de cancelamento de produção',
      module: 'Produção',
      description: `${req.user?.name || req.user?.email || 'Usuário'} solicitou cancelamento de ${row.material_code || row.material_name} em ${row.production_date}: ${reason}`,
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

function trackingPayload(rows, planRows = [], unplannedRows = []) {
  const activeRows = rows.filter(row => !isCanceledPlan(row));
  const summary = activeRows.reduce((acc, row) => {
    acc.planned_total += toNumber(row.planned_qty);
    acc.actual_total += toNumber(row.actual_qty);
    acc.open_items += Math.max(0, toNumber(row.planned_qty) - toNumber(row.actual_qty));
    return acc;
  }, { planned_total: 0, actual_total: 0, open_items: 0 });
  summary.adherence_percent = summary.planned_total === 0
    ? 0
    : Number(((summary.actual_total / summary.planned_total) * 100).toFixed(2));
  summary.planned_total = Number(summary.planned_total.toFixed(2));
  summary.actual_total = Number(summary.actual_total.toFixed(2));
  return { summary, rows, plans: planRows, unplanned: unplannedRows };
}

function allocateTrackingRows(planRows, actualRows) {
  const actualsByDateMaterial = new Map();
  for (const row of actualRows) {
    const key = trackingDateMaterialKey(row, 'production_date');
    if (!key) continue;
    if (!actualsByDateMaterial.has(key)) actualsByDateMaterial.set(key, {
      productionDate: toDateOnly(row.production_date),
      materialName: row.material_name,
      materialCode: row.material_code,
      actualQty: 0,
      actualUnit: row.actual_unit || row.primary_unit || ''
    });
    const actual = actualsByDateMaterial.get(key);
    actual.actualQty += toNumber(row.actual_qty ?? row.quantity);
  }

  const activeGroups = new Map();
  const canceledRows = [];
  for (const row of planRows) {
    const normalized = { ...row, planned_date: toDateOnly(row.planned_date) };
    const key = trackingDateMaterialKey(normalized);
    if (!key) continue;
    if (isCanceledPlan(row)) {
      const plannedQty = toNumber(row.planned_qty);
      canceledRows.push({
        ...normalized,
        plans: [{ id: row.plan_id, code: row.planning_code }],
        planning_codes: row.planning_code || '',
        actual_qty: 0,
        difference: Number((0 - plannedQty).toFixed(3)),
        percent_done: 0,
        status: 'Cancelado'
      });
      continue;
    }
    if (!activeGroups.has(key)) activeGroups.set(key, {
      key,
      planned_date: normalized.planned_date,
      material_name: row.material_name,
      material_code: row.material_code,
      machine_name: row.machine_name,
      planned_unit: row.planned_unit,
      planned_qty: 0,
      plans: [],
      sourceRows: []
    });
    const group = activeGroups.get(key);
    group.planned_qty += toNumber(row.planned_qty);
    group.plans.push({ id: row.plan_id, code: row.planning_code });
    group.sourceRows.push(normalized);
  }

  const allocated = [...activeGroups.values()].map(group => {
    const actual = actualsByDateMaterial.get(group.key);
    const plannedQty = toNumber(group.planned_qty);
    const actualQty = Number(toNumber(actual?.actualQty).toFixed(3));
    const percentDone = plannedQty === 0 ? 0 : Number(((actualQty / plannedQty) * 100).toFixed(2));
    let status = 'Programado';
    if (actualQty > plannedQty && plannedQty > 0) status = 'Excedido';
    else if (actualQty >= plannedQty && plannedQty > 0) status = 'Cumprido';
    else if (actualQty > 0) status = 'Em andamento';

    return {
      ...group,
      planned_qty: Number(plannedQty.toFixed(3)),
      planning_codes: group.plans.map(plan => plan.code || plan.id).filter(Boolean).join(', '),
      actual_qty: actualQty,
      difference: Number((actualQty - plannedQty).toFixed(3)),
      percent_done: percentDone,
      status
    };
  });

  const planSummaries = buildPlanTracking(planRows, activeGroups, actualsByDateMaterial);
  const canceledKeys = new Set(canceledRows.map(row => trackingDateMaterialKey(row)));
  const unplannedRows = [...actualsByDateMaterial.entries()]
    .filter(([key]) => !activeGroups.has(key))
    .map(([key, actual]) => ({
      material_name: actual.materialName,
      material_code: actual.materialCode,
      production_date: actual.productionDate,
      actual_qty: Number(toNumber(actual.actualQty).toFixed(3)),
      actual_unit: actual.actualUnit,
      status: canceledKeys.has(key) ? 'Planejamento cancelado' : 'Item não planejado'
    }));

  return {
    rows: [...allocated, ...canceledRows],
    plans: planSummaries,
    unplanned: unplannedRows
  };
}

function buildPlanTracking(planRows, activeGroups, actualsByDateMaterial) {
  const planMap = new Map();
  for (const row of planRows) {
    const planKey = String(row.plan_id || '');
    if (!planKey) continue;
    if (!planMap.has(planKey)) planMap.set(planKey, {
      plan_id: row.plan_id,
      planning_code: row.planning_code,
      status: isCanceledPlan(row) ? 'Cancelado' : 'Programado',
      canceled: isCanceledPlan(row),
      planned_qty: 0,
      actual_qty: 0,
      dates: [],
      materials: new Map()
    });
    const plan = planMap.get(planKey);
    const plannedQty = toNumber(row.planned_qty);
    const plannedDate = toDateOnly(row.planned_date);
    plan.dates.push(plannedDate);
    plan.planned_qty += plannedQty;

    const materialKey = materialTrackingKey(row);
    const detailKey = `${materialKey}|${row.planned_unit || ''}`;
    if (!plan.materials.has(detailKey)) plan.materials.set(detailKey, {
      material_name: row.material_name,
      material_code: row.material_code,
      planned_unit: row.planned_unit,
      planned_qty: 0,
      actual_qty: 0,
      dates: [],
      last_planned_date: plannedDate,
      completed_date: null,
      canceled: plan.canceled
    });
    const detail = plan.materials.get(detailKey);
    detail.dates.push(plannedDate);
    detail.last_planned_date = detail.dates.filter(Boolean).sort().at(-1) || plannedDate;
    detail.planned_qty += plannedQty;

    if (!plan.canceled) {
      const group = activeGroups.get(trackingDateMaterialKey(row));
      const actual = actualsByDateMaterial.get(trackingDateMaterialKey(row));
      const groupPlanned = toNumber(group?.planned_qty);
      const actualShare = groupPlanned > 0 ? toNumber(actual?.actualQty) * (plannedQty / groupPlanned) : 0;
      plan.actual_qty += actualShare;
      detail.actual_qty += actualShare;
      if (!detail.completed_date && detail.planned_qty > 0 && detail.actual_qty >= detail.planned_qty) detail.completed_date = plannedDate;
    }
  }

  return [...planMap.values()].map(plan => {
    const plannedQty = Number(toNumber(plan.planned_qty).toFixed(3));
    const actualQty = Number(toNumber(plan.actual_qty).toFixed(3));
    const percentDone = plannedQty === 0 ? 0 : Number(((actualQty / plannedQty) * 100).toFixed(2));
    const dates = plan.dates.filter(Boolean).sort();
    let status = plan.status;
    if (!plan.canceled) {
      if (actualQty > plannedQty && plannedQty > 0) status = 'Excedido';
      else if (actualQty >= plannedQty && plannedQty > 0) status = 'Cumprido';
      else if (actualQty > 0) status = 'Em andamento';
    }
    return {
      plan_id: plan.plan_id,
      planning_code: plan.planning_code,
      period_start_date: dates[0] || null,
      period_end_date: dates.at(-1) || null,
      planned_qty: plannedQty,
      actual_qty: actualQty,
      percent_done: percentDone,
      status,
      materials: [...plan.materials.values()].map(detail => {
        const detailPlanned = Number(toNumber(detail.planned_qty).toFixed(3));
        const detailActual = Number(toNumber(detail.actual_qty).toFixed(3));
        const detailPercent = detailPlanned === 0 ? 0 : Number(((detailActual / detailPlanned) * 100).toFixed(2));
        const detailDates = detail.dates.filter(Boolean).sort();
        let detailStatus = detail.canceled ? 'Cancelado' : 'Programado';
        if (!detail.canceled) {
          if (detailActual > detailPlanned && detailPlanned > 0) detailStatus = 'Excedido';
          else if (detailActual >= detailPlanned && detailPlanned > 0) detailStatus = 'Cumprido';
          else if (detailActual > 0) detailStatus = 'Em andamento';
        }
        return {
          material_name: detail.material_name,
          material_code: detail.material_code,
          period_start_date: detailDates[0] || null,
          period_end_date: detailDates.at(-1) || null,
          planned_qty: detailPlanned,
          actual_qty: detailActual,
          percent_done: detailPercent,
          status: detailStatus,
          anticipated: Boolean(detail.completed_date && detail.last_planned_date && detail.completed_date < detail.last_planned_date)
        };
      })
    };
  });
}

router.get('/tracking', requirePermission('productivity:read'), async (req, res, next) => {
  try {
    const db = requireDb();
    const planRows = await db`
      WITH daily_plans AS (
        SELECT p.id AS plan_id,
               p.code AS planning_code,
               p.status,
               d.planned_date,
               d.material_name,
               d.material_code,
               d.machine_name,
               SUM(d.planned_qty) AS planned_qty
        FROM production_plan_days d
        JOIN production_plans p ON p.id = d.plan_id
        WHERE d.planned_qty > 0
          AND NULLIF(TRIM(d.machine_name), '') IS NOT NULL
        GROUP BY p.id, p.code, p.status, d.planned_date, d.material_name, d.material_code, d.machine_name
      ),
      legacy_fallback AS (
        SELECT p.id AS plan_id,
               p.code AS planning_code,
               p.status,
               p.start_date AS planned_date,
               p.material_name,
               p.material_code,
               p.machine_name,
               p.planned_qty
        FROM production_plans p
        WHERE NOT EXISTS (
          SELECT 1
          FROM production_plan_days d
          WHERE d.plan_id = p.id
            AND d.planned_qty > 0
            AND NULLIF(TRIM(d.machine_name), '') IS NOT NULL
        )
      ),
      all_days AS (
        SELECT * FROM daily_plans
        UNION ALL
        SELECT * FROM legacy_fallback
      )
      SELECT *
      FROM all_days
      ORDER BY planned_date, planning_code, material_name, machine_name
    `;
    const actualRows = await db`
      WITH launch_actuals AS (
        SELECT production_date, material_name, material_code, primary_unit AS actual_unit, quantity AS actual_qty
        FROM production_launches
        WHERE LOWER(TRIM(COALESCE(status, ''))) NOT IN ('canceled', 'cancelled', 'cancelado', 'cancelada')
          AND quantity > 0
      ),
      standalone_actuals AS (
        SELECT a.production_date, a.material_name, a.material_code, a.actual_unit, a.actual_qty
        FROM production_actuals a
        WHERE a.actual_qty > 0
          AND NOT EXISTS (
            SELECT 1
            FROM production_launches l
            WHERE l.production_date = a.production_date
              AND COALESCE(NULLIF(TRIM(l.material_code), ''), LOWER(TRIM(l.material_name))) = COALESCE(NULLIF(TRIM(a.material_code), ''), LOWER(TRIM(a.material_name)))
              AND l.quantity = a.actual_qty
          )
      ),
      actuals AS (
        SELECT * FROM launch_actuals
        UNION ALL
        SELECT * FROM standalone_actuals
      )
      SELECT production_date, material_name, material_code, actual_unit, SUM(actual_qty) AS actual_qty
      FROM actuals
      GROUP BY production_date, material_name, material_code, actual_unit
      ORDER BY production_date, material_name
    `;
    const allocated = allocateTrackingRows(planRows, actualRows);
    const rows = allocated.rows
      .filter(row => !req.query.planningCode || matchesFilter(row.planning_code, req.query.planningCode) || matchesFilter(row.planning_codes, req.query.planningCode))
      .filter(row => matchesFilter(row.material_name, req.query.material))
      .filter(row => matchesFilter(row.machine_name, req.query.machine))
      .filter(row => !req.query.startDate || toDateOnly(row.planned_date) >= req.query.startDate)
      .filter(row => !req.query.endDate || toDateOnly(row.planned_date) <= req.query.endDate)
      .sort((left, right) => (
        toDateOnly(right.planned_date).localeCompare(toDateOnly(left.planned_date))
        || String(left.planning_code || '').localeCompare(String(right.planning_code || ''))
        || String(left.material_name || '').localeCompare(String(right.material_name || ''))
      ));

    const plans = allocated.plans
      .filter(row => matchesFilter(row.planning_code, req.query.planningCode))
      .filter(row => !req.query.startDate || toDateOnly(row.period_end_date) >= req.query.startDate)
      .filter(row => !req.query.endDate || toDateOnly(row.period_start_date) <= req.query.endDate);
    const unplanned = allocated.unplanned
      .filter(row => matchesFilter(row.material_name, req.query.material))
      .filter(row => !req.query.startDate || toDateOnly(row.production_date) >= req.query.startDate)
      .filter(row => !req.query.endDate || toDateOnly(row.production_date) <= req.query.endDate)
      .sort((left, right) => toDateOnly(right.production_date).localeCompare(toDateOnly(left.production_date)));

    res.json(trackingPayload(rows, plans, unplanned));
  } catch (error) {
    next(error);
  }
});

export default router;
