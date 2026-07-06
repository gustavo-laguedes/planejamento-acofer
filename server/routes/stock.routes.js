import { Router } from 'express';
import { requireDb } from '../db.js';
import { businessDaysInclusive } from '../../services/workingDays.service.js';
import { requirePermission } from './middleware.js';
import { auditUser, recordAuditLog } from '../audit.js';

const router = Router();

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

const INVENTORY_DUPLICATE_WINDOW_SECONDS = 120;
const LOCATION_ORDER = ['matriz', 'feital', 'centro'];

function locationOrderValue(location) {
  const values = [location?.code, location?.name].map(normalizeText);
  const index = LOCATION_ORDER.findIndex(expected => values.includes(expected));
  return index === -1 ? LOCATION_ORDER.length : index;
}

function sortLocations(locations = []) {
  return [...locations].sort((left, right) => {
    const orderDiff = locationOrderValue(left) - locationOrderValue(right);
    if (orderDiff) return orderDiff;
    return String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR');
  });
}

function displayUserName(user) {
  return auditUser(user).name || 'Sistema';
}

async function ensureInventoryEditMetadata(db) {
  await db`
    ALTER TABLE inventory_counts
      ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS edited_by_user_id BIGINT,
      ADD COLUMN IF NOT EXISTS edited_by_user_name TEXT
  `;
}

function emptyLocation(location) {
  return {
    locationId: location.id,
    code: location.code,
    name: location.name,
    nasajonQty: 0,
    errorQty: 0
  };
}

function emptyCodeBreakdown(code, locations) {
  return {
    code,
    stockByLocation: Object.fromEntries(locations.map(location => [String(location.id), emptyLocation(location)]))
  };
}

function salesProjection(material, currentBalance, salesPeriodQty, businessDays) {
  if (material.permits_sales === false) {
    return { salesPeriodQty, salesPerDayQty: null, stockDurationDays: null, blocked: true };
  }
  const days = Number(businessDays || 0);
  if (days <= 0) return { salesPeriodQty, salesPerDayQty: null, stockDurationDays: null, notEstimated: true };
  const salesPerDayQty = Math.max(toNumber(salesPeriodQty) / days, 0);
  return {
    salesPeriodQty,
    salesPerDayQty,
    stockDurationDays: salesPerDayQty > 0 ? currentBalance / salesPerDayQty : null,
    notEstimated: salesPerDayQty <= 0
  };
}

function summarizeMaterial(material, locations, stockRows, correctionRows, businessDays = 0, latestInventory = null) {
  const codes = Array.isArray(material.codes) ? material.codes.map(String) : [];
  const codeSet = new Set(codes.map(normalizeText));
  const codeBreakdown = new Map(codes.map(code => [normalizeText(code), emptyCodeBreakdown(code, locations)]));
  const stockByLocation = Object.fromEntries(locations.map(location => [String(location.id), emptyLocation(location)]));
  const correctionQty = toNumber(correctionRows[0]?.correction_qty);
  const inventoryByLocation = Object.fromEntries(
    correctionRows
      .filter(row => row.location_id)
      .map(row => [String(row.location_id), toNumber(row.adjustment_qty)])
  );

  let unmappedNasajonQty = 0;
  let salesPeriodQty = 0;

  for (const row of stockRows) {
    const productCode = normalizeText(row.product_code);
    const oldProductCode = normalizeText(row.old_product_code);
    const matchedCode = codes.find(code => {
      const normalizedCode = normalizeText(code);
      return normalizedCode && (normalizedCode === productCode || normalizedCode === oldProductCode);
    });
    if (!matchedCode || !codeSet.has(normalizeText(matchedCode))) continue;

    const nasajonQty = toNumber(row.fiscal_balance_unit);
    const errorQty = toNumber(row.error_balance_unit);
    salesPeriodQty += toNumber(row.sales_unit);

    const establishment = normalizeText(row.establishment);
    const location = locations.find(item => normalizeText(item.code) === establishment || normalizeText(item.name) === establishment);
    if (!location) {
      unmappedNasajonQty += nasajonQty + errorQty;
      continue;
    }
    const locationKey = String(location.id);
    const breakdown = codeBreakdown.get(normalizeText(matchedCode));
    breakdown.stockByLocation[locationKey].nasajonQty += nasajonQty;
    breakdown.stockByLocation[locationKey].errorQty += errorQty;
    stockByLocation[locationKey].nasajonQty += nasajonQty;
    stockByLocation[locationKey].errorQty += errorQty;
  }

  const totalLocationsQty = Object.values(stockByLocation)
    .reduce((sum, location) => sum + toNumber(location.nasajonQty) + toNumber(location.errorQty), 0) + correctionQty;
  const projection = salesProjection(material, totalLocationsQty, salesPeriodQty, businessDays);

  return {
    material: {
      id: material.id,
      name: material.name,
      permitsSales: material.permits_sales !== false,
      active: material.active
    },
    codes,
    codeBreakdown: [...codeBreakdown.values()],
    stockByLocation,
    inventoryByLocation,
    latestInventory,
    totalLocationsQty,
    correctionQty,
    unmappedNasajonQty,
    salesPeriodQty: projection.salesPeriodQty,
    salesPerDayQty: projection.salesPerDayQty,
    stockDurationDays: projection.stockDurationDays,
    salesBlocked: projection.blocked === true,
    salesNotEstimated: projection.notEstimated === true
  };
}

async function buildInventoryTemplate(db) {
  const [materials, locations, stockRows, adjustmentRows] = await Promise.all([
    db`SELECT id, name, codes, permits_sales, active FROM materials WHERE active = true ORDER BY name`,
    db`SELECT id, code, name, active FROM locations WHERE active = true ORDER BY code NULLS LAST, name`,
    db`SELECT establishment, product_code, old_product_code, fiscal_balance_unit, error_balance_unit, sales_unit FROM stock_snapshot`,
    db`
      SELECT DISTINCT ON (material_id, location_id)
             material_id, location_id, adjustment_qty, notes, updated_at
      FROM stock_location_adjustments
      ORDER BY material_id, location_id, updated_at DESC, id DESC
    `
  ]);

  const adjustmentsByMaterial = new Map();
  for (const adjustment of adjustmentRows) {
    const key = String(adjustment.material_id);
    if (!adjustmentsByMaterial.has(key)) adjustmentsByMaterial.set(key, []);
    adjustmentsByMaterial.get(key).push(adjustment);
  }

  const orderedLocations = sortLocations(locations);
  return {
    locations: orderedLocations,
    rows: materials.map(material => summarizeMaterial(material, orderedLocations, stockRows, adjustmentsByMaterial.get(String(material.id)) || []))
  };
}

async function ensureManualLaunchTables(db) {
  await db`
    CREATE TABLE IF NOT EXISTS stock_transport_records (
      id BIGSERIAL PRIMARY KEY,
      transport_date DATE NOT NULL,
      material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL,
      origin_location_id BIGINT REFERENCES locations(id) ON DELETE SET NULL,
      destination_location_id BIGINT REFERENCES locations(id) ON DELETE SET NULL,
      quantity NUMERIC NOT NULL DEFAULT 0,
      invoice_number TEXT,
      notes TEXT,
      user_id BIGINT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS material_purchase_records (
      id BIGSERIAL PRIMARY KEY,
      purchase_date DATE NOT NULL,
      material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL,
      location_id BIGINT REFERENCES locations(id) ON DELETE SET NULL,
      quantity NUMERIC NOT NULL DEFAULT 0,
      invoice_number TEXT,
      notes TEXT,
      user_id BIGINT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_stock_transport_records_date ON stock_transport_records (transport_date DESC, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS idx_material_purchase_records_date ON material_purchase_records (purchase_date DESC, created_at DESC)`;
}

router.get('/', async (req, res, next) => {
  try {
    const db = requireDb();
    const search = `%${req.query.search || ''}%`;
    const code = `%${req.query.productCode || ''}%`;
    const establishment = req.query.establishment || null;
    const category = req.query.category || null;
    const group = req.query.group || null;
    const controlledOnly = req.query.controlledOnly === 'true';
    const limit = Math.min(Number(req.query.limit || 200), 1000);
    const offset = Number(req.query.offset || 0);

    const rows = await db`
      WITH adjustments AS (
        SELECT product_code, establishment,
               COALESCE(SUM(adjustment_unit_qty), 0) AS adjustment_unit_qty,
               COALESCE(SUM(adjustment_kg_qty), 0) AS adjustment_kg_qty
        FROM stock_adjustments
        GROUP BY product_code, establishment
      )
      SELECT s.*,
             COALESCE(a.adjustment_unit_qty, 0) AS adjustment_unit_qty,
             COALESCE(a.adjustment_kg_qty, 0) AS adjustment_kg_qty,
             COALESCE(s.fiscal_balance_unit, 0) + COALESCE(a.adjustment_unit_qty, 0) AS adjusted_unit_qty,
             COALESCE(s.fiscal_balance_kg_theoretical, s.fiscal_balance_kg_float, 0) + COALESCE(a.adjustment_kg_qty, 0) AS adjusted_kg_qty
      FROM stock_snapshot s
      LEFT JOIN adjustments a ON a.product_code = s.product_code AND a.establishment = s.establishment
      WHERE (${req.query.search || ''} = '' OR s.specification ILIKE ${search})
        AND (${req.query.productCode || ''} = '' OR s.product_code ILIKE ${code})
        AND (${establishment}::text IS NULL OR s.establishment = ${establishment})
        AND (${category}::text IS NULL OR s.category = ${category})
        AND (${group}::text IS NULL OR s.inventory_group = ${group})
        AND (${controlledOnly} = false OR s.controls_weight = true)
      ORDER BY s.specification NULLS LAST, s.product_code
      LIMIT ${limit} OFFSET ${offset}
    `;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/summary', async (req, res, next) => {
  try {
    const db = requireDb();
    const [totals] = await db`
      SELECT COUNT(*)::int AS total_items,
             COALESCE(SUM(sales_unit), 0)::numeric AS total_sales_unit,
             COALESCE(SUM(orders_unit), 0)::numeric AS total_orders_unit
      FROM stock_snapshot
    `;
    const byEstablishment = await db`
      SELECT establishment, COALESCE(SUM(fiscal_balance_unit), 0)::numeric AS total_unit
      FROM stock_snapshot
      GROUP BY establishment
      ORDER BY establishment
    `;
    const [lastImport] = await db`
      SELECT id, filename, status, total_rows, finished_at, created_at
      FROM import_history
      ORDER BY created_at DESC
      LIMIT 1
    `;
    res.json({ totals, byEstablishment, lastImport: lastImport || null });
  } catch (error) {
    next(error);
  }
});

router.get('/materials-overview', async (req, res, next) => {
  try {
    const db = requireDb();
    const [materials, locations, stockRows, correctionRows, latestInventoryRows, lastImportRows] = await Promise.all([
      db`
        SELECT id, name, codes, permits_sales, active
        FROM materials
        WHERE active = true
        ORDER BY name
      `,
      db`
        SELECT id, code, name, active
        FROM locations
        WHERE active = true
        ORDER BY code NULLS LAST, name
      `,
      db`
        SELECT establishment, product_code, old_product_code, fiscal_balance_unit, error_balance_unit, sales_unit
        FROM stock_snapshot
      `,
      db`
        SELECT DISTINCT ON (material_id)
               material_id, correction_qty, notes, updated_at
        FROM stock_material_corrections
        ORDER BY material_id, updated_at DESC, id DESC
      `,
      db`
        WITH latest AS (
          SELECT DISTINCT ON (i.material_id)
                 i.material_id, i.inventory_count_id, c.created_at
          FROM inventory_count_items i
          JOIN inventory_counts c ON c.id = i.inventory_count_id
          ORDER BY i.material_id, c.created_at DESC, c.id DESC
        )
        SELECT latest.material_id,
               latest.created_at,
               COALESCE(SUM(i.counted_qty), 0)::numeric AS total_counted_qty
        FROM latest
        JOIN inventory_count_items i
          ON i.inventory_count_id = latest.inventory_count_id
         AND i.material_id = latest.material_id
        GROUP BY latest.material_id, latest.created_at
      `,
      db`
        SELECT id, filename, status, total_rows, finished_at, created_at,
               period_start, period_end, business_days
        FROM import_history
        WHERE status = 'success'
        ORDER BY created_at DESC
        LIMIT 1
      `
    ]);

    const correctionsByMaterial = new Map();
    for (const correction of correctionRows) {
      const key = String(correction.material_id);
      if (!correctionsByMaterial.has(key)) correctionsByMaterial.set(key, []);
      correctionsByMaterial.get(key).push(correction);
    }
    const latestInventoryByMaterial = new Map(latestInventoryRows.map(row => [String(row.material_id), {
      totalCountedQty: toNumber(row.total_counted_qty),
      countedAt: row.created_at
    }]));
    const lastImport = lastImportRows[0] || null;
    const businessDays = Number(lastImport?.business_days || 0);
    const orderedLocations = sortLocations(locations);

    const rows = materials.map(material => summarizeMaterial(
      material,
      orderedLocations,
      stockRows,
      correctionsByMaterial.get(String(material.id)) || [],
      businessDays,
      latestInventoryByMaterial.get(String(material.id)) || null
    ));

    res.json({
      locations: orderedLocations,
      rows,
      lastImport
    });
  } catch (error) {
    next(error);
  }
});

router.put('/import-period', requirePermission('stock:write'), async (req, res, next) => {
  try {
    const periodStart = String(req.body.periodStart || '').slice(0, 10);
    const periodEnd = String(req.body.periodEnd || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
      return res.status(400).json({ error: 'Informe o período inicial e final.' });
    }
    if (periodStart > periodEnd) {
      return res.status(400).json({ error: 'O período inicial não pode ser posterior ao período final.' });
    }
    const businessDays = businessDaysInclusive(periodStart, periodEnd);
    const db = requireDb();
    const [lastImport] = await db`
      SELECT id
      FROM import_history
      WHERE status = 'success'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!lastImport) return res.status(404).json({ error: 'Nenhuma importação concluída encontrada.' });
    const [updated] = await db`
      UPDATE import_history
      SET period_start = ${periodStart}, period_end = ${periodEnd}, business_days = ${businessDays}
      WHERE id = ${lastImport.id}
      RETURNING id, period_start, period_end, business_days
    `;
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.get('/inventory/template', requirePermission('inventory:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    res.json(await buildInventoryTemplate(db));
  } catch (error) {
    next(error);
  }
});

router.post('/inventory/counts', requirePermission('inventory:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    const notes = String(req.body.notes || '').trim() || null;
    const userId = req.user?.id || null;
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const filledItems = items
      .map(item => ({
        materialId: Number(item.materialId),
        locationId: Number(item.locationId),
        previousQty: toNumber(item.previousQty),
        countedQty: item.countedQty === '' || item.countedQty === null || item.countedQty === undefined ? null : toNumber(item.countedQty)
      }))
      .filter(item => item.materialId && item.locationId && item.countedQty !== null);
    if (!filledItems.length) return res.status(400).json({ error: 'Preencha ao menos um saldo atualizado.' });

    const result = await db.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(${userId || 0}, ${filledItems.length})`;

      const [duplicate] = await tx`
        SELECT c.*
        FROM inventory_counts c
        JOIN inventory_count_items i ON i.inventory_count_id = c.id
        WHERE (${userId}::bigint IS NULL OR c.user_id = ${userId})
          AND (${userId}::bigint IS NOT NULL OR c.user_id IS NULL)
          AND c.created_at >= now() - (${INVENTORY_DUPLICATE_WINDOW_SECONDS} || ' seconds')::interval
        GROUP BY c.id
        HAVING COUNT(i.id)::int = ${filledItems.length}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT 1
      `;
      if (duplicate) return { ...duplicate, duplicate: true };

      const [count] = await tx`
        INSERT INTO inventory_counts (notes, user_id)
        VALUES (${notes}, ${userId})
        RETURNING *
      `;
      for (const item of filledItems) {
        await tx`
          INSERT INTO inventory_count_items (inventory_count_id, material_id, location_id, previous_qty, counted_qty)
          VALUES (${count.id}, ${item.materialId}, ${item.locationId}, ${item.previousQty}, ${item.countedQty})
        `;
        await tx`
          INSERT INTO stock_location_adjustments (material_id, location_id, adjustment_qty, notes, updated_at)
          VALUES (${item.materialId}, ${item.locationId}, ${item.countedQty}, ${notes}, now())
          ON CONFLICT (material_id, location_id)
          DO UPDATE SET adjustment_qty = EXCLUDED.adjustment_qty,
                        notes = EXCLUDED.notes,
                        updated_at = now()
        `;
      }
      return count;
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/inventory/counts', requirePermission('inventory:read'), async (req, res, next) => {
  try {
    const db = requireDb();
    await ensureInventoryEditMetadata(db);
    const rows = await db`
      SELECT c.id, c.notes, c.user_id, c.created_at, c.edited_at, c.edited_by_user_id, c.edited_by_user_name,
             COUNT(DISTINCT i.material_id)::int AS item_count
      FROM inventory_counts c
      LEFT JOIN inventory_count_items i ON i.inventory_count_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 100
    `;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/inventory/counts/:id', requirePermission('inventory:read'), async (req, res, next) => {
  try {
    const db = requireDb();
    await ensureInventoryEditMetadata(db);
    const [count] = await db`
      SELECT id, notes, user_id, created_at, edited_at, edited_by_user_id, edited_by_user_name
      FROM inventory_counts
      WHERE id = ${req.params.id}
    `;
    if (!count) return res.status(404).json({ error: 'Inventário não encontrado.' });

    const items = await db`
      SELECT i.id, i.material_id, i.location_id, i.previous_qty, i.counted_qty,
             m.name AS material_name, m.codes AS material_codes,
             l.name AS location_name, l.code AS location_code
      FROM inventory_count_items i
      JOIN materials m ON m.id = i.material_id
      JOIN locations l ON l.id = i.location_id
      WHERE i.inventory_count_id = ${req.params.id}
      ORDER BY m.name, l.code NULLS LAST, l.name
    `;

    const materials = new Map();
    for (const item of items) {
      const key = String(item.material_id);
      if (!materials.has(key)) {
        materials.set(key, {
          materialId: item.material_id,
          materialName: item.material_name,
          codes: item.material_codes || [],
          locations: []
        });
      }
      materials.get(key).locations.push({
        locationId: item.location_id,
        locationName: item.location_name,
        locationCode: item.location_code,
        previousQty: item.previous_qty,
        countedQty: item.counted_qty
      });
    }

    res.json({ ...count, materials: [...materials.values()] });
  } catch (error) {
    next(error);
  }
});

router.put('/inventory/counts/:id', requirePermission('inventory:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    await ensureInventoryEditMetadata(db);
    const countId = Number(req.params.id);
    const user = auditUser(req.user);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const normalizedItems = items
      .map(item => ({
        materialId: Number(item.materialId),
        locationId: Number(item.locationId),
        countedQty: item.countedQty === '' || item.countedQty === null || item.countedQty === undefined ? null : toNumber(item.countedQty)
      }))
      .filter(item => item.materialId && item.locationId && item.countedQty !== null);

    if (!countId) return res.status(400).json({ error: 'Inventario invalido.' });
    if (!normalizedItems.length) return res.status(400).json({ error: 'Informe ao menos um saldo.' });

    const result = await db.begin(async tx => {
      const [count] = await tx`
        SELECT id, created_at
        FROM inventory_counts
        WHERE id = ${countId}
        FOR UPDATE
      `;
      if (!count) return null;

      const currentItems = await tx`
        SELECT i.id, i.material_id, i.location_id, i.counted_qty, m.name AS material_name, l.name AS location_name
        FROM inventory_count_items i
        JOIN materials m ON m.id = i.material_id
        JOIN locations l ON l.id = i.location_id
        WHERE i.inventory_count_id = ${countId}
      `;
      const currentByKey = new Map(currentItems.map(item => [`${item.material_id}:${item.location_id}`, item]));
      const changes = [];

      for (const item of normalizedItems) {
        const current = currentByKey.get(`${item.materialId}:${item.locationId}`);
        if (!current) continue;
        const previousQty = toNumber(current.counted_qty);
        if (previousQty === item.countedQty) continue;
        changes.push({ ...item, itemId: current.id, previousQty, materialName: current.material_name, locationName: current.location_name });
      }

      if (!changes.length) {
        const [unchanged] = await tx`
          SELECT id, notes, user_id, created_at, edited_at, edited_by_user_id, edited_by_user_name
          FROM inventory_counts
          WHERE id = ${countId}
        `;
        return { count: unchanged, changes: [] };
      }

      for (const change of changes) {
        await tx`
          UPDATE inventory_count_items
          SET counted_qty = ${change.countedQty}
          WHERE id = ${change.itemId}
        `;

        const [latestForLocation] = await tx`
          SELECT i.id
          FROM inventory_count_items i
          JOIN inventory_counts c ON c.id = i.inventory_count_id
          WHERE i.material_id = ${change.materialId}
            AND i.location_id = ${change.locationId}
          ORDER BY c.created_at DESC, c.id DESC, i.id DESC
          LIMIT 1
        `;
        if (String(latestForLocation?.id || '') === String(change.itemId)) {
          await tx`
            INSERT INTO stock_location_adjustments (material_id, location_id, adjustment_qty, notes, updated_at)
            VALUES (${change.materialId}, ${change.locationId}, ${change.countedQty}, 'Editado pelo inventario', now())
            ON CONFLICT (material_id, location_id)
            DO UPDATE SET adjustment_qty = EXCLUDED.adjustment_qty,
                          notes = EXCLUDED.notes,
                          updated_at = now()
          `;
        }
      }

      const [updatedCount] = await tx`
        UPDATE inventory_counts
        SET edited_at = now(),
            edited_by_user_id = ${user.id},
            edited_by_user_name = ${displayUserName(req.user)}
        WHERE id = ${countId}
        RETURNING id, notes, user_id, created_at, edited_at, edited_by_user_id, edited_by_user_name
      `;

      return { count: updatedCount, changes };
    });

    if (!result) return res.status(404).json({ error: 'Inventario nao encontrado.' });

    if (result.changes.length) {
      const changedMaterials = [...new Set(result.changes.map(change => change.materialName))].join(', ');
      const inventoryDate = result.count.created_at
        ? new Date(result.count.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        : `ID ${countId}`;
      await recordAuditLog(db, {
        user: req.user,
        action: 'Inventário editado',
        module: 'Estoque',
        description: `Inventario de ${inventoryDate}. Materiais alterados: ${changedMaterials}. Usuario: ${displayUserName(req.user)}.`,
        recordRef: countId
      });
    }

    res.json({ ...result.count, changedItems: result.changes.length });
  } catch (error) {
    next(error);
  }
});

router.get('/manual-transports', requirePermission('launches:read'), async (req, res, next) => {
  try {
    const db = requireDb();
    await ensureManualLaunchTables(db);
    const rows = await db`
      SELECT r.id, r.transport_date, r.quantity, r.invoice_number, r.notes, r.user_id, r.created_at,
             m.name AS material_name, m.codes AS material_codes,
             origin.name AS origin_location_name,
             destination.name AS destination_location_name
      FROM stock_transport_records r
      LEFT JOIN materials m ON m.id = r.material_id
      LEFT JOIN locations origin ON origin.id = r.origin_location_id
      LEFT JOIN locations destination ON destination.id = r.destination_location_id
      ORDER BY r.transport_date DESC, r.created_at DESC, r.id DESC
      LIMIT 200
    `;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/manual-transports', requirePermission('launches:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    await ensureManualLaunchTables(db);
    const transportDate = String(req.body.transportDate || '').slice(0, 10);
    const materialId = Number(req.body.materialId);
    const originLocationId = Number(req.body.originLocationId);
    const destinationLocationId = Number(req.body.destinationLocationId);
    const quantity = toNumber(req.body.quantity);
    const invoiceNumber = String(req.body.invoiceNumber || '').trim() || null;
    const notes = String(req.body.notes || '').trim() || null;
    const userId = req.user?.id || null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(transportDate) || !materialId || !originLocationId || !destinationLocationId || quantity <= 0) {
      return res.status(400).json({ error: 'Data, material, locais e quantidade sao obrigatorios.' });
    }
    if (originLocationId === destinationLocationId) {
      return res.status(400).json({ error: 'Local de origem e destino devem ser diferentes.' });
    }

    const [row] = await db`
      INSERT INTO stock_transport_records (
        transport_date, material_id, origin_location_id, destination_location_id,
        quantity, invoice_number, notes, user_id
      )
      VALUES (
        ${transportDate}, ${materialId}, ${originLocationId}, ${destinationLocationId},
        ${quantity}, ${invoiceNumber}, ${notes}, ${userId}
      )
      RETURNING *
    `;
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.get('/material-purchases', requirePermission('launches:read'), async (req, res, next) => {
  try {
    const db = requireDb();
    await ensureManualLaunchTables(db);
    const rows = await db`
      SELECT r.id, r.purchase_date, r.quantity, r.invoice_number, r.notes, r.user_id, r.created_at,
             m.name AS material_name, m.codes AS material_codes,
             l.name AS location_name
      FROM material_purchase_records r
      LEFT JOIN materials m ON m.id = r.material_id
      LEFT JOIN locations l ON l.id = r.location_id
      ORDER BY r.purchase_date DESC, r.created_at DESC, r.id DESC
      LIMIT 200
    `;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/material-purchases', requirePermission('launches:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    await ensureManualLaunchTables(db);
    const purchaseDate = String(req.body.purchaseDate || '').slice(0, 10);
    const materialId = Number(req.body.materialId);
    const locationId = Number(req.body.locationId);
    const quantity = toNumber(req.body.quantity);
    const invoiceNumber = String(req.body.invoiceNumber || '').trim() || null;
    const notes = String(req.body.notes || '').trim() || null;
    const userId = req.user?.id || null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) || !materialId || !locationId || quantity <= 0) {
      return res.status(400).json({ error: 'Data, material, local e quantidade sao obrigatorios.' });
    }

    const [row] = await db`
      INSERT INTO material_purchase_records (
        purchase_date, material_id, location_id, quantity, invoice_number, notes, user_id
      )
      VALUES (
        ${purchaseDate}, ${materialId}, ${locationId}, ${quantity}, ${invoiceNumber}, ${notes}, ${userId}
      )
      RETURNING *
    `;
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

router.put('/materials-overview/adjustments', requirePermission('stock:write'), async (req, res, next) => {
  try {
    const materialId = Number(req.body.materialId);
    const locationId = Number(req.body.locationId);
    const adjustmentQty = toNumber(req.body.adjustmentQty);
    const notes = String(req.body.notes || '').trim() || null;

    if (!materialId || !locationId) {
      return res.status(400).json({ error: 'Material e local sao obrigatorios.' });
    }

    const db = requireDb();
    const [row] = await db`
      INSERT INTO stock_location_adjustments (material_id, location_id, adjustment_qty, notes, updated_at)
      VALUES (${materialId}, ${locationId}, ${adjustmentQty}, ${notes}, now())
      ON CONFLICT (material_id, location_id)
      DO UPDATE SET adjustment_qty = EXCLUDED.adjustment_qty,
                    notes = EXCLUDED.notes,
                    updated_at = now()
      RETURNING *
    `;
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.put('/materials-overview/corrections', requirePermission('stock:write'), async (req, res, next) => {
  try {
    const materialId = Number(req.body.materialId);
    const correctionQty = toNumber(req.body.correctionQty);
    const notes = String(req.body.notes || '').trim() || null;

    if (!materialId) {
      return res.status(400).json({ error: 'Material e obrigatorio.' });
    }

    const db = requireDb();
    const [row] = await db`
      INSERT INTO stock_material_corrections (material_id, correction_qty, notes, updated_at)
      VALUES (${materialId}, ${correctionQty}, ${notes}, now())
      ON CONFLICT (material_id)
      DO UPDATE SET correction_qty = EXCLUDED.correction_qty,
                    notes = EXCLUDED.notes,
                    updated_at = now()
      RETURNING *
    `;
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.post('/adjustments', requirePermission('stock:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    const { productCode, establishment, adjustmentUnitQty, adjustmentKgQty, reason } = req.body;
    if (!productCode || !establishment || !reason) {
      return res.status(400).json({ error: 'Produto, estabelecimento e motivo sao obrigatorios.' });
    }

    const [row] = await db`
      INSERT INTO stock_adjustments (product_code, establishment, adjustment_unit_qty, adjustment_kg_qty, reason)
      VALUES (${productCode}, ${establishment}, ${Number(adjustmentUnitQty || 0)}, ${Number(adjustmentKgQty || 0)}, ${reason})
      RETURNING *
    `;
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

export default router;
