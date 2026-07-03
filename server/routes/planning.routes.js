import { Router } from 'express';
import { requireDb } from '../db.js';
import { buildPlan, rescheduleSavedPlan } from '../../services/planning.service.js';
import { createPlanningPdf } from '../../services/pdf.service.js';
import { requirePermission } from './middleware.js';
import { recordAuditLog } from '../audit.js';
import { businessDaysBetween, holidaysForYear } from '../../services/workingDays.service.js';

const router = Router();
const DEFAULT_TEAM_AVAILABLE = 6;

function isDefaultShiftLabel(label = '') {
  return /^Turno\s*1$/i.test(String(label || '').trim()) || /^T1$/i.test(String(label || '').trim());
}

function defaultTeamAvailableForShift(shift = {}) {
  const available = Math.max(toNumber(shift.teamAvailable ?? DEFAULT_TEAM_AVAILABLE), 0);
  return isDefaultShiftLabel(shift.label) ? Math.max(available, DEFAULT_TEAM_AVAILABLE) : available;
}

function isValidDateOnly(value) {
  const dateValue = dateOnlyValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return false;
  const date = new Date(`${dateValue}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateValue;
}

function normalizeDateOnly(...values) {
  const value = values.find(isValidDateOnly);
  return value ? dateOnlyValue(value) : null;
}

function dateOnlyValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

function addDateDays(value, days) {
  const date = new Date(`${dateOnlyValue(value)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addProjectionQuantity(targetMap, date, key, quantity) {
  if (!key) return;
  if (!targetMap.has(date)) targetMap.set(date, new Map());
  const dayMap = targetMap.get(date);
  dayMap.set(key, toNumber(dayMap.get(key)) + toNumber(quantity));
}

function productionQuantityForDate(date, codes, materialName, productionByDateCode, productionByDateName) {
  const codeMap = productionByDateCode.get(date) || new Map();
  const nameMap = productionByDateName.get(date) || new Map();
  const codeQuantity = codes.reduce((sum, code) => sum + toNumber(codeMap.get(normalizeText(code))), 0);
  return codeQuantity || toNumber(nameMap.get(normalizeText(materialName)));
}

function projectedFutureStock(currentStock, targetDate, today, codes, materialName, salesPerDay, productionByDateCode, productionByDateName) {
  let balance = Math.max(0, toNumber(currentStock));
  for (let date = addDateDays(today, 1); date <= targetDate; date = addDateDays(date, 1)) {
    const productionQty = productionQuantityForDate(date, codes, materialName, productionByDateCode, productionByDateName);
    const consumptionQty = businessDaysBetween(addDateDays(date, -1), date) > 0 ? toNumber(salesPerDay) : 0;
    balance = Math.max(0, balance + productionQty - consumptionQty);
  }
  return balance;
}

function projectedPastStock(currentStock, targetDate, today, codes, materialName, salesPerDay, productionByDateCode, productionByDateName) {
  let productionQty = 0;
  for (let date = addDateDays(targetDate, 1); date <= today; date = addDateDays(date, 1)) {
    productionQty += productionQuantityForDate(date, codes, materialName, productionByDateCode, productionByDateName);
  }
  const consumptionQty = salesPerDay === null ? null : toNumber(salesPerDay) * businessDaysBetween(targetDate, today);
  return Math.max(0, toNumber(currentStock) - productionQty + toNumber(consumptionQty));
}

function normalizeJsonObject(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function stockProjectionSalesPerDay(material, salesPeriodQty, businessDays) {
  if (material.permits_sales === false || businessDays <= 0) return null;
  const salesPerDay = toNumber(salesPeriodQty) / businessDays;
  return salesPerDay > 0 ? salesPerDay : null;
}

function stockProjectionDurationDays(estimatedStock, salesPerDay) {
  if (!salesPerDay || !Number.isFinite(Number(estimatedStock))) return null;
  return Math.max(Number(estimatedStock), 0) / salesPerDay;
}

function stockShortageKey(item = {}) {
  return [
    item.materialId ?? '',
    item.materialCode || '',
    item.materialName || item.material || '',
    item.unit || ''
  ].join('|');
}

function treeRoots(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return Array.isArray(tree.children) && normalizeText(tree.materialName) === normalizeText('Plano de produção') ? tree.children : [tree];
}

function collectStockShortages(tree) {
  const grouped = new Map();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    const requiredQty = toNumber(node.requiredQty);
    const stockQty = toNumber(node.stockQty);
    if (node.isInitialRawMaterial && requiredQty > stockQty) {
      const item = {
        materialId: node.materialId ?? null,
        materialCode: node.materialCode || '',
        materialName: node.materialName || '',
        material: node.materialName || '',
        unit: node.unit || '',
        requiredQty,
        stockQty,
        shortageQty: Math.max(requiredQty - stockQty, 0)
      };
      const key = stockShortageKey(item);
      const current = grouped.get(key);
      if (current) {
        current.requiredQty = Number((current.requiredQty + item.requiredQty).toFixed(3));
        current.stockQty = Number(Math.max(current.stockQty, item.stockQty).toFixed(3));
        current.shortageQty = Number(Math.max(current.requiredQty - current.stockQty, 0).toFixed(3));
      } else {
        grouped.set(key, {
          ...item,
          requiredQty: Number(item.requiredQty.toFixed(3)),
          stockQty: Number(item.stockQty.toFixed(3)),
          shortageQty: Number(item.shortageQty.toFixed(3))
        });
      }
    }
    (node.children || []).forEach(visit);
  }
  treeRoots(tree).forEach(visit);
  return [...grouped.values()];
}

function canAuthorizeStockShortage(user) {
  return ['Super Admin', 'Diretor', 'Gerente'].includes(String(user?.role || '').trim());
}

function stockAuthorizationPayload(req, shortages) {
  if (!shortages.length) return null;
  if (!canAuthorizeStockShortage(req.user)) {
    const error = new Error('Você não possui permissão para autorizar planejamentos com estoque insuficiente.');
    error.status = 403;
    throw error;
  }
  const authorization = req.body?.stockAuthorization || {};
  if (authorization.confirmed !== true || authorization.method !== 'clerk_authenticated_confirmation') {
    const error = new Error('Confirmação autenticada obrigatória para autorizar planejamento com estoque insuficiente.');
    error.status = 403;
    throw error;
  }
  return {
    type: 'stock_shortage_authorization',
    message: 'Planejamento salvo mediante autorização por estoque insuficiente.',
    authorizationMethod: 'clerk_authenticated_confirmation',
    materials: shortages,
    authorizedBy: {
      id: req.user?.id || null,
      clerkUserId: req.user?.clerkUserId || req.user?.sub || null,
      name: req.user?.name || req.user?.email || 'Usuário',
      email: req.user?.email || null,
      role: req.user?.role || null
    },
    authorizedAt: new Date().toISOString()
  };
}

function attachStockAuthorization(plan, authorization) {
  if (!authorization) return plan;
  const tree = { ...(plan.tree || {}), _stockAuthorization: authorization };
  const operations = (plan.operations || []).map((operation, index) => index === 0
    ? { ...operation, _planningMeta: { ...(operation._planningMeta || {}), stockAuthorization: authorization } }
    : operation);
  return { ...plan, tree, operations };
}

function stockAuthorizationAuditDescription(plan, authorization) {
  const lines = [
    `Planejamento ${plan.code || ''} salvo com autorização apesar de estoque insuficiente.`,
    `Usuário autenticado pelo Clerk: ${authorization.authorizedBy.name}${authorization.authorizedBy.email ? ` <${authorization.authorizedBy.email}>` : ''}.`,
    `Clerk user id: ${authorization.authorizedBy.clerkUserId || 'não informado'}.`,
    `Perfil: ${authorization.authorizedBy.role || 'não informado'}.`,
    `Autorizado em: ${authorization.authorizedAt}.`,
    `Método de autorização: ${authorization.authorizationMethod || 'clerk_authenticated_confirmation'}.`
  ];
  authorization.materials.forEach(item => {
    lines.push(
      `Material: ${item.materialName || item.material || ''}`,
      `Necessário: ${item.requiredQty} ${item.unit || ''}`.trim(),
      `Saldo: ${item.stockQty} ${item.unit || ''}`.trim(),
      `Falta: ${item.shortageQty} ${item.unit || ''}`.trim()
    );
  });
  return lines.join('\n');
}

function operationSegments(operationsValue) {
  return normalizeJsonArray(operationsValue).flatMap(operation =>
    (Array.isArray(operation.segments) ? operation.segments : []).map((segment, segmentIndex) => ({
      operation,
      segment,
      segmentIndex,
      used: false
    }))
  );
}

function segmentMatchesDay(item, day) {
  const operation = item.operation || {};
  const segment = item.segment || {};
  const sameDate = dateOnlyValue(segment.date) === dateOnlyValue(day.planned_date);
  const sameMaterial = normalizeText(operation.materialCode) === normalizeText(day.material_code)
    || normalizeText(operation.materialName) === normalizeText(day.material_name);
  const sameMachine = !day.machine_name || !operation.machineName
    || normalizeText(operation.machineName) === normalizeText(day.machine_name);
  return sameDate && sameMaterial && sameMachine;
}

function teamOverrideForDate(meta = {}, shift = {}, date) {
  const overrides = meta.dailyTeamOverrides?.[date] || {};
  return overrides[shift.label] ?? overrides[String(shift.label || '').replace(/^Turno\s*/i, 'T')];
}

function fallbackShiftsForCalendarPlan(plan = {}, operations = []) {
  const meta = operations.find(operation => operation?._planningMeta)?._planningMeta || {};
  if (Array.isArray(meta.shifts) && meta.shifts.length) return meta.shifts;
  return [{
    label: 'Turno 1',
    hoursPerDay: plan.hours_per_day || 8,
    shiftStartTime: '07:00',
    shiftEndTime: '17:00',
    pauseHours: 0,
    teamAvailable: DEFAULT_TEAM_AVAILABLE
  }];
}

function calendarCapacityDays(planRows, startDate, endDate) {
  const rows = [];
  for (const plan of planRows) {
    const operations = normalizeJsonArray(plan.operations);
    const meta = operations.find(operation => operation?._planningMeta)?._planningMeta || {};
    const shifts = fallbackShiftsForCalendarPlan(plan, operations);
    if (!shifts.length) continue;
    const firstDate = normalizeDateOnly(plan.start_date, startDate);
    const lastDate = normalizeDateOnly(plan.end_date, endDate);
    if (!firstDate || !lastDate) continue;
    const cancelDate = String(plan.status || '').toLowerCase() === 'canceled'
      ? normalizeDateOnly(plan.canceled_at)
      : null;
    if (cancelDate && firstDate >= cancelDate) continue;
    const rangeStart = firstDate > startDate ? firstDate : startDate;
    const cancelRangeEnd = cancelDate ? addDateDays(cancelDate, -1) : null;
    const naturalRangeEnd = lastDate < endDate ? lastDate : endDate;
    const rangeEnd = cancelRangeEnd && cancelRangeEnd < naturalRangeEnd ? cancelRangeEnd : naturalRangeEnd;
    if (rangeStart > rangeEnd) continue;
    for (let date = rangeStart; date <= rangeEnd; date = addDateDays(date, 1)) {
      for (const shift of shifts) {
        if (!shift?.label) continue;
        const override = teamOverrideForDate(meta, shift, date);
        rows.push({
          date,
          plan_id: plan.id,
          team_capacity_label: shift.label,
          team_capacity_available: Number(override ?? defaultTeamAvailableForShift(shift)),
          team_capacity_overridden: override != null
        });
      }
    }
  }
  return rows;
}

function shiftForSegment(meta = {}, segment = {}, operation = {}) {
  const shifts = Array.isArray(meta.shifts) ? meta.shifts : [];
  if (!shifts.length) return null;
  const start = timeToMinutes(segment.startTime || operation.startTime);
  if (start === null) return shifts[0];
  return shifts.find(shift => {
    const shiftStart = timeToMinutes(shift.shiftStartTime);
    const shiftEnd = timeToMinutes(shift.shiftEndTime);
    return shiftStart !== null && shiftEnd !== null && start >= shiftStart && start < shiftEnd;
  }) || shifts[0];
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function minutesToTime(value) {
  const minutes = Math.max(0, Math.round(Number(value) || 0));
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function pauseEndTimeForShift(shift = {}) {
  if (shift.pauseEndTime) return shift.pauseEndTime;
  const start = timeToMinutes(shift.pauseStartTime);
  if (start === null) return null;
  const rawHours = String(shift.pauseHours ?? shift.lunchHours ?? 0).replace(',', '.');
  const pauseMinutes = Math.max(Number(rawHours) || 0, 0) * 60;
  return pauseMinutes > 0 ? minutesToTime(start + pauseMinutes) : null;
}

function enrichCalendarDays(rows) {
  const segmentsByPlan = new Map();
  return rows.map(row => {
    const planKey = String(row.plan_id);
    if (!segmentsByPlan.has(planKey)) segmentsByPlan.set(planKey, operationSegments(row.operations));
    const segments = segmentsByPlan.get(planKey);
    const matched = segments.find(item => !item.used && segmentMatchesDay(item, row))
      || segments.find(item => segmentMatchesDay(item, row));
    if (matched) matched.used = true;
    const operation = matched?.operation || {};
    const segment = matched?.segment || {};
    const meta = normalizeJsonArray(row.operations).find(item => item?._planningMeta)?._planningMeta || {};
    const shift = shiftForSegment(meta, segment, operation);
    const override = shift ? teamOverrideForDate(meta, shift, normalizeDateOnly(row.planned_date)) : null;
    const pauseEndTime = shift ? pauseEndTimeForShift(shift) : null;
    const operationType = operation.operationType || 'production';
    const machineName = operationType === 'transport'
      ? 'Transporte'
      : row.machine_name || operation.machineName || null;
    const peopleCount = operationType === 'transport'
      ? 0
      : row.people_count || operation.peopleCount || null;
    if (operationType !== 'transport' && (!machineName || !(Number(peopleCount) > 0))) return null;
    return {
      event_id: row.day_id ? `day-${row.day_id}` : `plan-${row.plan_id}-${dateOnlyValue(row.planned_date)}`,
      plan_id: row.plan_id,
      planning_code: row.planning_code,
      status: row.status,
      planned_date: normalizeDateOnly(row.planned_date),
      material_name: row.material_name,
      material_code: row.material_code,
      machine_name: machineName,
      people_count: peopleCount,
      planned_qty: row.planned_qty,
      planned_unit: row.planned_unit,
      operation_type: operationType,
      start_time: segment.startTime || operation.startTime || null,
      end_time: segment.endTime || operation.endTime || null,
      team_capacity_label: shift?.label || null,
      team_capacity_available: shift ? Number(override ?? defaultTeamAvailableForShift(shift)) : null,
      team_capacity_overridden: override != null,
      shift_pause_start_time: pauseEndTime ? shift?.pauseStartTime || null : null,
      shift_pause_end_time: pauseEndTime,
      production_index: Number.isFinite(Number(operation.productionIndex)) ? Number(operation.productionIndex) : 0,
      production_color: /^#[0-9a-f]{6}$/i.test(String(operation.productionColor || '')) ? String(operation.productionColor).toUpperCase() : null
    };
  }).filter(Boolean);
}

function formatDateBr(value) {
  const dateValue = normalizeDateOnly(value);
  if (!dateValue) return '';
  return dateValue.split('-').reverse().join('/');
}

function formatPeriodLabel(startDate, endDate) {
  const start = formatDateBr(startDate);
  const end = formatDateBr(endDate);
  return start && end ? `${start} at\u00e9 ${end}` : 'Per\u00edodo n\u00e3o informado';
}

function operationPeriod(operationsValue, fallbackStartDate = null, fallbackEndDate = null) {
  const operations = normalizeJsonArray(operationsValue);
  const starts = operations.map(operation => normalizeDateOnly(operation?.startDate)).filter(Boolean).sort();
  const ends = operations.map(operation => normalizeDateOnly(operation?.endDate)).filter(Boolean).sort();
  const startDate = starts[0] || normalizeDateOnly(fallbackStartDate);
  const endDate = ends.at(-1) || normalizeDateOnly(fallbackEndDate, fallbackStartDate);
  return {
    startDate,
    endDate,
    label: formatPeriodLabel(startDate, endDate)
  };
}

async function planningContext(db, payload = {}) {
  const materialId = Number(payload.materialId);
  const materialCode = String(payload.materialCode || '').trim();
  const scheduleStartDate = normalizeDateOnly(payload.planningStartDate, payload.selectedDate, payload.startDate);
  const scheduleEndDate = normalizeDateOnly(payload.planningEndDate, payload.endDate, scheduleStartDate ? addDateDays(scheduleStartDate, 120) : null);
  const [materials, inputs, stockRows, inventoryRows, correctionRows, productionRows, matrixRows, locations, existingPlans] = await Promise.all([
    db`SELECT * FROM materials WHERE active = true ORDER BY name`,
    db`SELECT * FROM material_inputs`,
    db`SELECT establishment, product_code, old_product_code, fiscal_balance_unit, error_balance_unit FROM stock_snapshot`,
    db`
      SELECT DISTINCT ON (material_id, location_id)
             material_id, location_id, adjustment_qty, updated_at
      FROM stock_location_adjustments
      ORDER BY material_id, location_id, updated_at DESC, id DESC
    `,
    db`
      SELECT DISTINCT ON (material_id)
             material_id, correction_qty, updated_at
      FROM stock_material_corrections
      ORDER BY material_id, updated_at DESC, id DESC
    `,
    db`SELECT material_id, quantity FROM production_launches WHERE material_id IS NOT NULL`,
    db`SELECT * FROM productivity_matrix WHERE active = true ORDER BY updated_at DESC`,
    db`SELECT * FROM locations WHERE active = true ORDER BY name`,
    scheduleStartDate && scheduleEndDate
      ? db`
          SELECT id, code, operations
          FROM production_plans
          WHERE status <> 'canceled'
            AND start_date <= ${scheduleEndDate}
            AND end_date >= ${scheduleStartDate}
            AND (${payload.planId || null}::bigint IS NULL OR id <> ${payload.planId || null})
        `
      : Promise.resolve([])
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
  const existingOperations = existingPlans.flatMap(plan =>
    normalizeJsonArray(plan.operations).map((operation, index) => ({
      ...operation,
      operationId: `plan:${plan.id}:${operation.operationId || operation.materialId || index}`,
      planningCode: plan.code || plan.id
    }))
  );
  return { material, materialsById, inputsByMaterialId, locationsById, stockRows, inventoryRows, correctionRows, productionRows, matrixRows, existingOperations };
}

router.post('/simulate', async (req, res, next) => {
  try {
    const db = requireDb();
    res.json(buildPlan(req.body, await planningContext(db, req.body)));
  } catch (error) {
    next(error);
  }
});

router.post('/plans', requirePermission('planning:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    const builtPlan = buildPlan(req.body, await planningContext(db, req.body));
    const stockShortages = collectStockShortages(builtPlan.tree);
    const stockAuthorization = stockAuthorizationPayload(req, stockShortages);
    const plan = attachStockAuthorization(builtPlan, stockAuthorization);
    const planningStartDate = normalizeDateOnly(
      req.body.planningStartDate,
      req.body.startDate,
      req.body.selectedDate,
      plan.summary.planningStartDate,
      plan.summary.startDate
    );
    const planningEndDate = operationPeriod(
      plan.operations,
      planningStartDate,
      normalizeDateOnly(req.body.planningEndDate, req.body.endDate, plan.summary.planningEndDate, plan.summary.endDate, planningStartDate)
    ).endDate;
    if (!planningStartDate || !planningEndDate) {
      return res.status(400).json({ error: 'Período do planejamento inválido.' });
    }
    const saved = await db.begin(async tx => {
      const [created] = await tx`
        INSERT INTO production_plans (
          code, material_name, material_code, machine_name, people_count, planned_qty,
          planned_unit, hours_per_day, start_date, end_date, status, date_mode, schedule_tree, operations, user_id
        )
        VALUES (
          ${plan.code}, ${plan.summary.materialName}, ${plan.summary.materialCode}, ${plan.summary.machineName || ''},
          ${Number(plan.summary.peopleCount || 0)}, ${plan.summary.plannedQty}, ${plan.summary.plannedUnit},
          ${plan.summary.hoursPerDay}, ${planningStartDate}, ${planningEndDate}, 'planned', ${plan.summary.dateMode},
          ${JSON.stringify(plan.tree)}::jsonb, ${JSON.stringify(plan.operations)}::jsonb, NULL
        )
        RETURNING *
      `;
      for (const day of plan.days) {
        await tx`
          INSERT INTO production_plan_days (plan_id, planned_date, material_name, material_code, machine_name, people_count, planned_qty, planned_unit)
          VALUES (${created.id}, ${day.planned_date}, ${day.material_name}, ${day.material_code}, ${day.machine_name || ''}, ${Number(day.people_count || 0)}, ${day.planned_qty}, ${day.planned_unit})
        `;
      }
      return created;
    });
    await recordAuditLog(db, {
      user: req.user,
      action: 'Criação de planejamento',
      module: 'Planejamento',
      description: `Criou planejamento ${saved.code || saved.id} para ${saved.material_name} (${saved.planned_qty} ${saved.planned_unit})`,
      recordRef: saved.id
    });
    if (stockAuthorization) {
      await recordAuditLog(db, {
        user: req.user,
        action: 'Planejamento salvo com estoque insuficiente',
        module: 'Planejamento',
        description: stockAuthorizationAuditDescription({ ...plan, code: saved.code || plan.code }, stockAuthorization),
        recordRef: saved.id
      });
    }
    res.status(201).json({ plan: saved, days: plan.days, tree: plan.tree, operations: plan.operations });
  } catch (error) {
    next(error);
  }
});

router.get('/plans', async (req, res, next) => {
  try {
    const db = requireDb();
    const rows = await db`
      SELECT id, code, material_name, material_code, planned_qty, planned_unit, hours_per_day, start_date, end_date, status, created_at, schedule_tree, operations
      FROM production_plans
      ORDER BY created_at DESC
      LIMIT 100
    `;
    res.json(rows.map(row => {
      const operations = normalizeJsonArray(row.operations);
      const period = operationPeriod(operations, row.start_date, row.end_date);
      return {
        ...row,
        start_date: normalizeDateOnly(row.start_date),
        end_date: normalizeDateOnly(row.end_date),
        period_start_date: period.startDate,
        period_end_date: period.endDate,
        period_label: period.label,
        schedule_tree: normalizeJsonObject(row.schedule_tree),
        operations
      };
    }));
  } catch (error) {
    next(error);
  }
});

router.get('/analysis/planned-balance', async (req, res, next) => {
  try {
    const db = requireDb();
    const rows = await db`
      WITH active_plans AS (
        SELECT *
        FROM production_plans
        WHERE LOWER(COALESCE(status, '')) NOT IN ('canceled', 'cancelado', 'excluido', 'deleted', 'inactive', 'inativo')
      ),
      daily_plans AS (
        SELECT d.material_name,
               d.material_code,
               d.planned_unit,
               SUM(d.planned_qty) AS planned_qty
        FROM production_plan_days d
        JOIN active_plans p ON p.id = d.plan_id
        WHERE d.planned_qty > 0
        GROUP BY d.material_name, d.material_code, d.planned_unit
      ),
      legacy_fallback AS (
        SELECT p.material_name,
               p.material_code,
               p.planned_unit,
               SUM(p.planned_qty) AS planned_qty
        FROM active_plans p
        WHERE p.planned_qty > 0
          AND NOT EXISTS (
            SELECT 1
            FROM production_plan_days d
            WHERE d.plan_id = p.id
              AND d.planned_qty > 0
          )
        GROUP BY p.material_name, p.material_code, p.planned_unit
      ),
      planned AS (
        SELECT material_name, material_code, planned_unit, planned_qty FROM daily_plans
        UNION ALL
        SELECT material_name, material_code, planned_unit, planned_qty FROM legacy_fallback
      ),
      planned_grouped AS (
        SELECT material_name,
               material_code,
               planned_unit,
               SUM(planned_qty) AS planned_qty
        FROM planned
        GROUP BY material_name, material_code, planned_unit
      ),
      launch_actuals AS (
        SELECT production_date,
               material_name,
               material_code,
               primary_unit AS actual_unit,
               quantity AS actual_qty
        FROM production_launches
        WHERE LOWER(COALESCE(status, '')) NOT IN ('canceled', 'cancelado')
          AND quantity > 0
      ),
      standalone_actuals AS (
        SELECT a.production_date,
               a.material_name,
               a.material_code,
               a.actual_unit,
               a.actual_qty
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
        SELECT material_name, material_code, actual_unit, actual_qty FROM launch_actuals
        UNION ALL
        SELECT material_name, material_code, actual_unit, actual_qty FROM standalone_actuals
      ),
      actuals_grouped AS (
        SELECT material_name,
               material_code,
               actual_unit,
               SUM(actual_qty) AS produced_qty
        FROM actuals
        GROUP BY material_name, material_code, actual_unit
      )
      SELECT m.id AS material_id,
             COALESCE(m.name, p.material_name) AS material_name,
             p.material_code,
             COALESCE(m.primary_unit, p.planned_unit) AS unit,
             SUM(p.planned_qty) AS planned_qty,
             COALESCE(SUM(a.produced_qty), 0) AS produced_qty,
             GREATEST(SUM(p.planned_qty) - COALESCE(SUM(a.produced_qty), 0), 0) AS remaining_qty
      FROM planned_grouped p
      LEFT JOIN materials m
        ON LOWER(TRIM(p.material_name)) = LOWER(TRIM(m.name))
        OR (NULLIF(TRIM(p.material_code), '') IS NOT NULL AND p.material_code = ANY(m.codes))
      LEFT JOIN actuals_grouped a
        ON (
          NULLIF(TRIM(p.material_code), '') IS NOT NULL
          AND NULLIF(TRIM(a.material_code), '') IS NOT NULL
          AND LOWER(TRIM(a.material_code)) = LOWER(TRIM(p.material_code))
        )
        OR (
          LOWER(TRIM(a.material_name)) = LOWER(TRIM(p.material_name))
          AND COALESCE(NULLIF(TRIM(a.actual_unit), ''), p.planned_unit) = p.planned_unit
        )
      GROUP BY m.id, COALESCE(m.name, p.material_name), p.material_code, COALESCE(m.primary_unit, p.planned_unit)
      HAVING SUM(p.planned_qty) > 0
      ORDER BY material_name, material_code
    `;
    res.json({ rows });
  } catch (error) {
    next(error);
  }
});

router.get('/plans/:id', async (req, res, next) => {
  try {
    const db = requireDb();
    const [plan] = await db`SELECT * FROM production_plans WHERE id = ${req.params.id}`;
    if (!plan) return res.status(404).json({ error: 'Plano não encontrado.' });
    const days = await db`SELECT * FROM production_plan_days WHERE plan_id = ${req.params.id} ORDER BY planned_date, id`;
    const operations = normalizeJsonArray(plan.operations);
    const meta = operations.find(operation => operation?._planningMeta)?._planningMeta || {};
    const period = operationPeriod(operations, plan.start_date, plan.end_date);
    res.json({
      plan: {
        ...plan,
        period_start_date: period.startDate,
        period_end_date: period.endDate,
        period_label: period.label,
        schedule_tree: normalizeJsonObject(plan.schedule_tree),
        operations
      },
      days,
      tree: normalizeJsonObject(plan.schedule_tree),
      operations,
      summary: {
        planningStartDate: period.startDate,
        planningEndDate: period.endDate,
        shifts: meta.shifts || [],
        dailyTeamOverrides: meta.dailyTeamOverrides || {},
        productions: meta.productions || []
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/plans/:id/reschedule', requirePermission('planning:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    const [plan] = await db`SELECT * FROM production_plans WHERE id = ${req.params.id}`;
    if (!plan) return res.status(404).json({ error: 'Plano nÃ£o encontrado.' });
    if (plan.status === 'canceled') return res.status(400).json({ error: 'Planejamento cancelado nÃ£o pode ser editado.' });
    const matrixRows = await db`SELECT * FROM productivity_matrix WHERE active = true`;
    const result = rescheduleSavedPlan(plan, normalizeJsonArray(plan.operations), req.body || {}, matrixRows);
    const updated = await db.begin(async tx => {
      const [row] = await tx`
        UPDATE production_plans
        SET operations = ${JSON.stringify(result.operations)}::jsonb,
            start_date = ${normalizeDateOnly(plan.start_date, result.summary.planningStartDate)},
            end_date = ${normalizeDateOnly(result.days.at(-1)?.planned_date, plan.end_date)}
        WHERE id = ${req.params.id}
        RETURNING *
      `;
      await tx`DELETE FROM production_plan_days WHERE plan_id = ${req.params.id}`;
      for (const day of result.days) {
        await tx`
          INSERT INTO production_plan_days (plan_id, planned_date, material_name, material_code, machine_name, people_count, planned_qty, planned_unit)
          VALUES (${req.params.id}, ${day.planned_date}, ${day.material_name}, ${day.material_code}, ${day.machine_name || ''}, ${Number(day.people_count || 0)}, ${day.planned_qty}, ${day.planned_unit})
        `;
      }
      return row;
    });
    await recordAuditLog(db, {
      user: req.user,
      action: 'EdiÃ§Ã£o de planejamento',
      module: 'Planejamento',
      description: `Atualizou cronograma do planejamento ${updated.code || updated.id}`,
      recordRef: updated.id
    });
    res.json({
      plan: {
        ...updated,
        schedule_tree: normalizeJsonObject(updated.schedule_tree),
        operations: result.operations
      },
      days: result.days,
      tree: normalizeJsonObject(updated.schedule_tree),
      operations: result.operations,
      summary: result.summary
    });
  } catch (error) {
    next(error);
  }
});

router.post('/plans/:id/cancel', requirePermission('planning:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    const [row] = await db`
      UPDATE production_plans
      SET status = 'canceled', canceled_at = now(), cancel_reason = ${req.body.reason || 'Cancelado pelo usuário'}
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!row) return res.status(404).json({ error: 'Plano não encontrado.' });
    await recordAuditLog(db, {
      user: req.user,
      action: 'Exclusão de planejamento',
      module: 'Planejamento',
      description: `Cancelou planejamento ${row.code || row.id} para ${row.material_name}`,
      recordRef: row.id
    });
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

router.get('/calendar', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = isValidDateOnly(req.query.startDate) ? dateOnlyValue(req.query.startDate) : `${today.slice(0, 7)}-01`;
    const endDate = isValidDateOnly(req.query.endDate) ? dateOnlyValue(req.query.endDate) : startDate;
    if (startDate > endDate) return res.status(400).json({ error: 'Período do calendário inválido.' });

    const db = requireDb();
    const [eventRows, capacityPlans] = await Promise.all([
      db`
        WITH daily_events AS (
          SELECT d.id AS day_id,
                 p.id AS plan_id,
                 p.code AS planning_code,
                 p.status,
                 p.canceled_at,
                 p.operations,
                 d.planned_date,
                 d.material_name,
                 d.material_code,
                 d.machine_name,
                 d.people_count,
                 d.planned_qty,
                 d.planned_unit
          FROM production_plan_days d
          JOIN production_plans p ON p.id = d.plan_id
          WHERE d.planned_qty > 0
        ),
        legacy_fallback AS (
          SELECT NULL::bigint AS day_id,
                 p.id AS plan_id,
                 p.code AS planning_code,
                 p.status,
                 p.canceled_at,
                 p.operations,
                 p.start_date AS planned_date,
                 p.material_name,
                 p.material_code,
                 p.machine_name,
                 p.people_count,
                 p.planned_qty,
                 p.planned_unit
          FROM production_plans p
          WHERE NOT EXISTS (
            SELECT 1 FROM production_plan_days d
            WHERE d.plan_id = p.id AND d.planned_qty > 0
          )
        )
        SELECT *
        FROM (
          SELECT * FROM daily_events
          UNION ALL
          SELECT * FROM legacy_fallback
        ) calendar_events
        WHERE planned_date >= ${startDate}
          AND planned_date <= ${endDate}
          AND (
            COALESCE(status, '') <> 'canceled'
            OR (canceled_at IS NOT NULL AND planned_date < canceled_at::date)
          )
        ORDER BY planned_date, planning_code, material_name, day_id
      `,
      db`
        SELECT id, operations, start_date, end_date, hours_per_day, people_count, status, canceled_at
        FROM production_plans
        WHERE (
            COALESCE(status, '') <> 'canceled'
            OR (canceled_at IS NOT NULL AND start_date < canceled_at::date)
          )
          AND start_date <= ${endDate}
          AND COALESCE(end_date, start_date) >= ${startDate}
        ORDER BY start_date, id
      `
    ]);

    const firstYear = Number(startDate.slice(0, 4));
    const lastYear = Number(endDate.slice(0, 4));
    const holidays = [];
    for (let year = firstYear; year <= lastYear; year += 1) holidays.push(...holidaysForYear(year));
    res.json({
      events: enrichCalendarDays(eventRows),
      capacityDays: calendarCapacityDays(capacityPlans, startDate, endDate),
      holidays: holidays.filter(holiday => holiday.date >= startDate && holiday.date <= endDate)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/analysis/stock-alerts', async (req, res, next) => {
  try {
    const startDate = isValidDateOnly(req.query.start) ? dateOnlyValue(req.query.start) : null;
    const endDate = isValidDateOnly(req.query.end) ? dateOnlyValue(req.query.end) : null;
    const minimumDays = Number(req.query.minimumDays || 0);
    if (!startDate || !endDate || startDate > endDate) {
      return res.status(400).json({ error: 'Período dos alertas de estoque inválido.' });
    }
    if (!Number.isFinite(minimumDays) || minimumDays <= 0) {
      return res.json({ start: startDate, end: endDate, minimumDays: null, latestImport: null, alerts: {} });
    }

    const today = new Date().toISOString().slice(0, 10);
    const productionStartDate = startDate < today ? startDate : today;
    const productionEndDate = endDate > today ? endDate : today;
    const db = requireDb();
    const [materials, locations, stockRows, adjustmentRows, correctionRows, importRows, productionRows] = await Promise.all([
      db`SELECT id, name, codes, permits_sales FROM materials WHERE active = true AND permits_sales <> false ORDER BY name`,
      db`SELECT id, code, name FROM locations WHERE active = true`,
      db`SELECT establishment, product_code, old_product_code, fiscal_balance_unit, error_balance_unit, sales_unit FROM stock_snapshot`,
      db`
        SELECT DISTINCT ON (material_id, location_id)
               material_id, location_id, adjustment_qty
        FROM stock_location_adjustments
        ORDER BY material_id, location_id, updated_at DESC, id DESC
      `,
      db`
        SELECT DISTINCT ON (material_id)
               material_id, correction_qty
        FROM stock_material_corrections
        ORDER BY material_id, updated_at DESC, id DESC
      `,
      db`
        SELECT id, created_at, business_days
        FROM import_history
        WHERE status = 'success'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      db`
        SELECT d.planned_date, d.material_name, d.material_code, SUM(d.planned_qty) AS planned_qty
        FROM production_plan_days d
        JOIN production_plans p ON p.id = d.plan_id
        WHERE p.status <> 'canceled'
          AND d.planned_qty > 0
          AND d.planned_date >= ${productionStartDate}
          AND d.planned_date <= ${productionEndDate}
        GROUP BY d.planned_date, d.material_name, d.material_code
      `
    ]);

    const productionByDateCode = new Map();
    const productionByDateName = new Map();
    for (const row of productionRows) {
      const plannedDate = dateOnlyValue(row.planned_date);
      addProjectionQuantity(productionByDateCode, plannedDate, normalizeText(row.material_code), row.planned_qty);
      addProjectionQuantity(productionByDateName, plannedDate, normalizeText(row.material_name), row.planned_qty);
    }

    const locationIds = new Set(locations.map(location => String(location.id)));
    const locationNames = new Set(locations.flatMap(location => [normalizeText(location.code), normalizeText(location.name)]).filter(Boolean));
    const adjustmentsByMaterial = new Map();
    for (const row of adjustmentRows) {
      if (!locationIds.has(String(row.location_id))) continue;
      const key = String(row.material_id);
      adjustmentsByMaterial.set(key, toNumber(adjustmentsByMaterial.get(key)) + toNumber(row.adjustment_qty));
    }
    const correctionsByMaterial = new Map(correctionRows.map(row => [String(row.material_id), toNumber(row.correction_qty)]));
    const businessDays = Number(importRows[0]?.business_days || 0);

    const projectionBases = materials.map(material => {
      const codes = Array.isArray(material.codes) ? material.codes.map(String) : [];
      const normalizedCodes = new Set(codes.map(normalizeText).filter(Boolean));
      let currentStock = toNumber(adjustmentsByMaterial.get(String(material.id)))
        + toNumber(correctionsByMaterial.get(String(material.id)));
      let salesPeriodQty = 0;
      let hasStockRow = false;
      for (const stockRow of stockRows) {
        const matchesCode = normalizedCodes.has(normalizeText(stockRow.product_code))
          || normalizedCodes.has(normalizeText(stockRow.old_product_code));
        if (!matchesCode) continue;
        salesPeriodQty += toNumber(stockRow.sales_unit);
        if (locationNames.has(normalizeText(stockRow.establishment))) {
          currentStock += toNumber(stockRow.fiscal_balance_unit) + toNumber(stockRow.error_balance_unit);
          hasStockRow = true;
        }
      }
      return {
        material,
        codes,
        currentStock,
        salesPerDay: stockProjectionSalesPerDay(material, salesPeriodQty, businessDays),
        hasCurrentStock: hasStockRow
          || adjustmentsByMaterial.has(String(material.id))
          || correctionsByMaterial.has(String(material.id))
      };
    });

    const alerts = {};
    for (let date = startDate; date <= endDate; date = addDateDays(date, 1)) {
      const criticalMaterials = [];
      for (const base of projectionBases) {
        if (!base.hasCurrentStock) continue;
        const estimatedStock = date >= today
          ? projectedFutureStock(base.currentStock, date, today, base.codes, base.material.name, base.salesPerDay, productionByDateCode, productionByDateName)
          : projectedPastStock(base.currentStock, date, today, base.codes, base.material.name, base.salesPerDay, productionByDateCode, productionByDateName);
        const durationDays = stockProjectionDurationDays(estimatedStock, base.salesPerDay);
        const isCritical = base.salesPerDay
          ? Number.isFinite(durationDays) && durationDays <= minimumDays
          : Number.isFinite(estimatedStock) && estimatedStock <= 0;
        if (!isCritical) continue;
        criticalMaterials.push({
          material_id: base.material.id,
          material_name: base.material.name,
          material_codes: base.codes,
          estimated_stock: estimatedStock,
          sales_per_day: base.salesPerDay,
          duration_days: durationDays
        });
      }
      if (criticalMaterials.length) {
        alerts[date] = {
          criticalCount: criticalMaterials.length,
          materials: criticalMaterials
        };
      }
    }

    const latestImport = importRows[0]
      ? { id: importRows[0].id, created_at: importRows[0].created_at, business_days: importRows[0].business_days }
      : null;
    res.json({ start: startDate, end: endDate, minimumDays, latestImport, alerts });
  } catch (error) {
    next(error);
  }
});

router.get('/analysis/stock-projection', async (req, res, next) => {
  try {
    const targetDate = isValidDateOnly(req.query.date) ? dateOnlyValue(req.query.date) : null;
    if (!targetDate) return res.status(400).json({ error: 'Data da projeção inválida.' });

    const today = new Date().toISOString().slice(0, 10);
    const projectionStartDate = targetDate >= today ? today : targetDate;
    const projectionEndDate = targetDate >= today ? targetDate : today;
    const db = requireDb();
    const [materials, locations, stockRows, adjustmentRows, correctionRows, importRows, productionRows] = await Promise.all([
      db`SELECT id, name, codes, permits_sales FROM materials WHERE active = true AND permits_sales <> false ORDER BY name`,
      db`SELECT id, code, name FROM locations WHERE active = true`,
      db`SELECT establishment, product_code, old_product_code, fiscal_balance_unit, error_balance_unit, sales_unit FROM stock_snapshot`,
      db`
        SELECT DISTINCT ON (material_id, location_id)
               material_id, location_id, adjustment_qty
        FROM stock_location_adjustments
        ORDER BY material_id, location_id, updated_at DESC, id DESC
      `,
      db`
        SELECT DISTINCT ON (material_id)
               material_id, correction_qty
        FROM stock_material_corrections
        ORDER BY material_id, updated_at DESC, id DESC
      `,
      db`
        SELECT business_days
        FROM import_history
        WHERE status = 'success'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      db`
        SELECT d.planned_date, d.material_name, d.material_code, SUM(d.planned_qty) AS planned_qty
        FROM production_plan_days d
        JOIN production_plans p ON p.id = d.plan_id
        WHERE p.status <> 'canceled'
          AND d.planned_qty > 0
          AND d.planned_date >= ${projectionStartDate}
          AND d.planned_date <= ${projectionEndDate}
        GROUP BY d.planned_date, d.material_name, d.material_code
      `
    ]);

    const chainProductionByCode = new Map();
    const chainProductionByName = new Map();
    const targetProductionByCode = new Map();
    const targetProductionByName = new Map();
    const productionByDateCode = new Map();
    const productionByDateName = new Map();
    for (const row of productionRows) {
      const plannedDate = dateOnlyValue(row.planned_date);
      const includeInChain = targetDate >= today
        ? plannedDate >= today && plannedDate <= targetDate
        : plannedDate > targetDate && plannedDate <= today;
      if (normalizeText(row.material_code)) {
        const code = normalizeText(row.material_code);
        if (includeInChain) chainProductionByCode.set(code, toNumber(chainProductionByCode.get(code)) + toNumber(row.planned_qty));
        if (plannedDate === targetDate) targetProductionByCode.set(code, toNumber(targetProductionByCode.get(code)) + toNumber(row.planned_qty));
        addProjectionQuantity(productionByDateCode, plannedDate, code, row.planned_qty);
      }
      const name = normalizeText(row.material_name);
      if (includeInChain) {
        chainProductionByName.set(name, toNumber(chainProductionByName.get(name)) + toNumber(row.planned_qty));
      }
      if (plannedDate === targetDate) {
        targetProductionByName.set(name, toNumber(targetProductionByName.get(name)) + toNumber(row.planned_qty));
      }
      addProjectionQuantity(productionByDateName, plannedDate, name, row.planned_qty);
    }
    const locationIds = new Set(locations.map(location => String(location.id)));
    const locationNames = new Set(locations.flatMap(location => [normalizeText(location.code), normalizeText(location.name)]).filter(Boolean));
    const adjustmentsByMaterial = new Map();
    for (const row of adjustmentRows) {
      if (!locationIds.has(String(row.location_id))) continue;
      const key = String(row.material_id);
      adjustmentsByMaterial.set(key, toNumber(adjustmentsByMaterial.get(key)) + toNumber(row.adjustment_qty));
    }
    const correctionsByMaterial = new Map(correctionRows.map(row => [String(row.material_id), toNumber(row.correction_qty)]));
    const businessDays = Number(importRows[0]?.business_days || 0);
    const consumptionDays = targetDate >= today
      ? businessDaysBetween(today, targetDate)
      : businessDaysBetween(targetDate, today);

    const rows = materials.map(material => {
      const codes = Array.isArray(material.codes) ? material.codes.map(String) : [];
      const normalizedCodes = new Set(codes.map(normalizeText).filter(Boolean));
      const chainProductionQty = codes.reduce((sum, code) => sum + toNumber(chainProductionByCode.get(normalizeText(code))), 0)
        || toNumber(chainProductionByName.get(normalizeText(material.name)));
      const targetProductionQty = codes.reduce((sum, code) => sum + toNumber(targetProductionByCode.get(normalizeText(code))), 0)
        || toNumber(targetProductionByName.get(normalizeText(material.name)));

      let currentStock = toNumber(adjustmentsByMaterial.get(String(material.id)))
        + toNumber(correctionsByMaterial.get(String(material.id)));
      let salesPeriodQty = 0;
      let hasStockRow = false;
      for (const stockRow of stockRows) {
        const matchesCode = normalizedCodes.has(normalizeText(stockRow.product_code))
          || normalizedCodes.has(normalizeText(stockRow.old_product_code));
        if (!matchesCode) continue;
        salesPeriodQty += toNumber(stockRow.sales_unit);
        if (locationNames.has(normalizeText(stockRow.establishment))) {
          currentStock += toNumber(stockRow.fiscal_balance_unit) + toNumber(stockRow.error_balance_unit);
          hasStockRow = true;
        }
      }
      const salesPerDay = material.permits_sales === false || businessDays <= 0
        ? null
        : salesPeriodQty / businessDays;
      const consumptionQty = salesPerDay === null ? null : salesPerDay * consumptionDays;
      const hasCurrentStock = hasStockRow
        || adjustmentsByMaterial.has(String(material.id))
        || correctionsByMaterial.has(String(material.id));
      const estimatedStock = hasCurrentStock
        ? targetDate >= today
          ? projectedFutureStock(currentStock, targetDate, today, codes, material.name, salesPerDay, productionByDateCode, productionByDateName)
          : Math.max(0, currentStock - chainProductionQty + toNumber(consumptionQty))
        : null;
      return {
        material_id: material.id,
        material_name: material.name,
        material_codes: codes,
        current_stock: hasCurrentStock ? currentStock : null,
        sales_per_day: salesPerDay > 0 ? salesPerDay : null,
        production_qty: targetProductionQty,
        consumption_days: consumptionDays,
        consumption_qty: consumptionQty,
        estimated_stock: estimatedStock
      };
    }).slice(0, 250);

    res.json({ date: targetDate, base_date: today, rows });
  } catch (error) {
    next(error);
  }
});

router.get('/plans/:id/pdf', async (req, res, next) => {
  try {
    const db = requireDb();
    const [plan] = await db`SELECT * FROM production_plans WHERE id = ${req.params.id}`;
    if (!plan) return res.status(404).json({ error: 'Plano não encontrado.' });
    const days = await db`SELECT * FROM production_plan_days WHERE plan_id = ${req.params.id} ORDER BY planned_date`;
    const normalizedPlan = {
      ...plan,
      schedule_tree: normalizeJsonObject(plan.schedule_tree),
      operations: normalizeJsonArray(plan.operations)
    };
    const pdf = await createPlanningPdf(normalizedPlan, days, normalizedPlan.schedule_tree, normalizedPlan.operations);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=planejamento-${plan.code || plan.id}.pdf`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

export default router;
