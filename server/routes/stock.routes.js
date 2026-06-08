import { Router } from 'express';
import { requireDb } from '../db.js';

const router = Router();

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function emptyLocation(location, inventoryQty = null) {
  return {
    locationId: location.id,
    code: location.code,
    name: location.name,
    nasajonQty: 0,
    errorQty: 0,
    inventoryQty: inventoryQty === null || inventoryQty === undefined ? null : toNumber(inventoryQty)
  };
}

function summarizeMaterial(material, locations, stockRows, adjustmentRows, producedQty = 0) {
  const codes = Array.isArray(material.codes) ? material.codes.map(String) : [];
  const codeSet = new Set(codes.map(normalizeText));
  const adjustmentsByLocation = new Map(adjustmentRows.map(row => [String(row.location_id), row.adjustment_qty]));
  const stockByLocation = Object.fromEntries(
    locations.map(location => [String(location.id), emptyLocation(location, adjustmentsByLocation.get(String(location.id)))])
  );

  let unmappedNasajonQty = 0;
  let ordersQty = 0;
  let salesQty = 0;

  for (const row of stockRows) {
    const productCode = normalizeText(row.product_code);
    const oldProductCode = normalizeText(row.old_product_code);
    if (!codeSet.has(productCode) && !codeSet.has(oldProductCode)) continue;

    const nasajonQty = toNumber(row.fiscal_balance_unit);
    ordersQty += toNumber(row.orders_unit);
    salesQty += toNumber(row.sales_unit);

    const establishment = normalizeText(row.establishment);
    const location = locations.find(item => normalizeText(item.code) === establishment || normalizeText(item.name) === establishment);
    if (!location) {
      unmappedNasajonQty += nasajonQty;
      continue;
    }
    stockByLocation[String(location.id)].nasajonQty += nasajonQty;
  }

  const totalLocationsQty = Object.values(stockByLocation)
    .reduce((sum, location) => sum + (location.inventoryQty === null ? toNumber(location.nasajonQty) : toNumber(location.inventoryQty)), 0);
  const totalEstimatedQty = totalLocationsQty + toNumber(producedQty) + ordersQty - salesQty;

  return {
    material: {
      id: material.id,
      name: material.name,
      active: material.active
    },
    codes,
    stockByLocation,
    inventoryByLocation: Object.fromEntries(Object.values(stockByLocation).map(location => [String(location.locationId), location.inventoryQty])),
    totalLocationsQty,
    producedQty: toNumber(producedQty),
    unmappedNasajonQty,
    ordersQty,
    salesQty,
    salesPerDayQty: salesQty,
    totalEstimatedQty
  };
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
    const [materials, locations, stockRows, adjustmentRows, productionRows, lastImportRows] = await Promise.all([
      db`
        SELECT id, name, codes, active
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
        SELECT establishment, product_code, old_product_code, fiscal_balance_unit, orders_unit, sales_unit
        FROM stock_snapshot
      `,
      db`
        SELECT DISTINCT ON (material_id, location_id)
               material_id, location_id, adjustment_qty, notes, updated_at
        FROM stock_location_adjustments
        ORDER BY material_id, location_id, updated_at DESC, id DESC
      `,
      db`
        SELECT material_id, COALESCE(SUM(quantity), 0) AS produced_qty
        FROM production_launches
        WHERE material_id IS NOT NULL
        GROUP BY material_id
      `,
      db`
        SELECT id, filename, status, total_rows, finished_at, created_at
        FROM import_history
        ORDER BY created_at DESC
        LIMIT 1
      `
    ]);

    const adjustmentsByMaterial = new Map();
    for (const adjustment of adjustmentRows) {
      const key = String(adjustment.material_id);
      if (!adjustmentsByMaterial.has(key)) adjustmentsByMaterial.set(key, []);
      adjustmentsByMaterial.get(key).push(adjustment);
    }
    const producedByMaterial = new Map(productionRows.map(row => [String(row.material_id), row.produced_qty]));

    const rows = materials.map(material => summarizeMaterial(
      material,
      locations,
      stockRows,
      adjustmentsByMaterial.get(String(material.id)) || [],
      producedByMaterial.get(String(material.id)) || 0
    ));

    res.json({
      locations,
      rows,
      lastImport: lastImportRows[0] || null
    });
  } catch (error) {
    next(error);
  }
});

router.get('/inventory/template', async (req, res, next) => {
  try {
    const db = requireDb();
    const [materials, locations, stockRows, adjustmentRows] = await Promise.all([
      db`SELECT id, name, codes, active FROM materials WHERE active = true ORDER BY name`,
      db`SELECT id, code, name, active FROM locations WHERE active = true ORDER BY code NULLS LAST, name`,
      db`SELECT establishment, product_code, old_product_code, fiscal_balance_unit, orders_unit, sales_unit FROM stock_snapshot`,
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
    res.json({
      locations,
      rows: materials.map(material => summarizeMaterial(material, locations, stockRows, adjustmentsByMaterial.get(String(material.id)) || []))
    });
  } catch (error) {
    next(error);
  }
});

router.post('/inventory/counts', async (req, res, next) => {
  try {
    const db = requireDb();
    const notes = String(req.body.notes || '').trim() || null;
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
      const [count] = await tx`
        INSERT INTO inventory_counts (notes, user_id)
        VALUES (${notes}, NULL)
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
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/inventory/counts', async (req, res, next) => {
  try {
    const db = requireDb();
    const rows = await db`
      SELECT c.id, c.notes, c.user_id, c.created_at, COUNT(i.id)::int AS item_count
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

router.put('/materials-overview/adjustments', async (req, res, next) => {
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

router.post('/adjustments', async (req, res, next) => {
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
