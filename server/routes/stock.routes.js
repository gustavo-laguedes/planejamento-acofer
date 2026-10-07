import { Router } from 'express';
import { requireDb } from '../db.js';
import { businessDaysInclusive } from '../../services/workingDays.service.js';
import { requirePermission, requireSuperAdmin } from './middleware.js';
import { auditUser, recordAuditLog } from '../audit.js';
import { resolveMaterialStockMetrics } from '../../services/materialStockMetrics.service.js';
import { buildCurrentStockBalances } from '../../services/currentStock.service.js';

const router = Router();

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function roundPurchaseQty(value, digits = 6) {
  return Number(toNumber(value).toFixed(digits));
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

function summarizeMaterial(material, locations, stockRows, correctionRows, businessDays = 0, latestInventory = null) {
  const codes = Array.isArray(material.codes) ? material.codes.map(String) : [];
  const codeSet = new Set(codes.map(normalizeText));
  const codeBreakdown = new Map(codes.map(code => [normalizeText(code), emptyCodeBreakdown(code, locations)]));
  const stockByLocation = Object.fromEntries(locations.map(location => [String(location.id), emptyLocation(location)]));
  const metrics = resolveMaterialStockMetrics({ material, locations, stockRows, correctionRows, businessDays });
  const correctionQty = metrics.correctionQty;
  const inventoryByLocation = Object.fromEntries(
    correctionRows
      .filter(row => row.location_id)
      .map(row => [String(row.location_id), toNumber(row.adjustment_qty)])
  );

  let unmappedNasajonQty = 0;
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
    totalLocationsQty: metrics.totalLocationsQty,
    correctionQty,
    unmappedNasajonQty,
    salesPeriodQty: metrics.salesPeriodQty,
    salesPerDayQty: metrics.salesPerDayQty,
    stockDurationDays: metrics.stockDurationDays,
    salesBlocked: metrics.blocked === true,
    salesNotEstimated: metrics.notEstimated === true
  };
}

async function buildInventoryTemplate(db) {
  const context =
    await loadCurrentStockContext(
      db
    );


  const orderedLocations =
    sortLocations(
      context.locations
      ||
      []
    );


  const materials =
    new Map();


  for (
    const row
    of context.rows || []
  ) {
    const key =
      String(
        row.materialId
      );


    if (!materials.has(key)) {
      materials.set(
        key,
        {
          material: {
            id:
              row.materialId,

            name:
              row.materialName,

            permitsSales:
              row.permitsSales
              !== false,

            active:
              true
          },

          codes:
            row.materialCodes
            ||
            [],

          stockByLocation:
            {},

          inventoryByLocation:
            {}
        }
      );
    }


    const current =
      materials.get(key);


    current.stockByLocation[
      String(row.locationId)
    ] = {
      locationId:
        row.locationId,

      code:
        row.locationCode,

      name:
        row.locationName,

      nasajonQty:
        toNumber(
          row.nasajonQty
        ),

      errorQty:
        toNumber(
          row.errorQty
        )
    };


    /*
     * O valor sugerido para o inventario
     * passa a ser o FISICO CORRIGIDO.
     *
     * Isso NAO significa que o inventario
     * sera salvo como correcao.
     */
    current.inventoryByLocation[
      String(row.locationId)
    ] =
      toNumber(
        row.currentQty
      );
  }


  return {
    locations:
      orderedLocations,

    rows:
      [
        ...materials.values()
      ]
  };
}

export async function loadCurrentStockContext(
  db,
  { excludePlanId = null } = {}
) {
  const [
    materials,
    locations,
    inventories,
    productionLaunches,
    sales,
    plannedRows,
    materialInputs,
    stockRows,
    correctionRows,
    lastImportRows
  ] =
    await Promise.all([
      db`
        SELECT
          id,
          name,
          codes,
          primary_unit,
          permits_sales,
          active

        FROM materials

        WHERE
          active = true

        ORDER BY
          name
      `,


      db`
        SELECT
          id,
          code,
          name,
          active

        FROM locations

        WHERE
          active = true

        ORDER BY
          code NULLS LAST,
          name
      `,


      /*
       * Inventarios permanecem aqui
       * apenas para referencia/icone.
       */
      db`
        SELECT
          i.inventory_count_id,
          i.material_id,
          i.location_id,
          i.counted_qty,
          c.created_at

        FROM inventory_count_items i

        JOIN inventory_counts c
          ON c.id =
             i.inventory_count_id

        JOIN materials m
          ON m.id =
             i.material_id

        JOIN locations l
          ON l.id =
             i.location_id

        WHERE
          m.active = true

          AND
          l.active = true

        ORDER BY
          c.created_at DESC,
          c.id DESC,
          i.id DESC
      `,


      /*
       * Producoes realizadas ainda sao
       * necessarias para descobrir quanto
       * de uma programacao ja foi produzido.
       *
       * Mas NAO serao usadas para alterar
       * o saldo fisico.
       */
      db`
        SELECT
          p.id,
          p.production_date,
          p.material_id,
          p.quantity,
          p.primary_unit,
          p.production_model_name,
          p.consumed_inputs,
          p.machine_name,
          p.created_at,
          p.location_name,

          COALESCE(
            p.location_id,
            machine_location.location_id
          ) AS location_id

        FROM production_launches p

        LEFT JOIN LATERAL (
          SELECT
            m.location_id

          FROM machines m

          WHERE
            LOWER(
              TRIM(m.name)
            )
            =
            LOWER(
              TRIM(p.machine_name)
            )

          ORDER BY
            m.active DESC,
            m.id

          LIMIT 1
        )
        machine_location
          ON true

        WHERE
          LOWER(
            TRIM(
              COALESCE(
                p.status,
                ''
              )
            )
          )
          NOT IN (
            'canceled',
            'cancelled',
            'cancelado',
            'cancelada'
          )

          AND
          p.quantity > 0
      `,


      /*
       * Historico de vendas usado por
       * Vendas/dia e duracao.
       */
      db`
        SELECT
          s.import_id,
          s.material_id,
          s.location_id,
          s.period_start,
          s.period_end,
          s.sales_qty,
          s.product_codes,
          s.created_at

        FROM stock_import_sales_history s

        JOIN import_history h
          ON h.id = s.import_id

        WHERE
          h.status = 'success'
      `,


      /*
       * Planejamentos existentes:
       * fonte de Pendente e Reserva.
       */
      db`
        WITH active_plans AS (
          SELECT
            *

          FROM production_plans

          WHERE
            LOWER(
              TRIM(
                COALESCE(
                  status,
                  ''
                )
              )
            )

            NOT IN (
              'canceled',
              'cancelled',
              'cancelado',
              'cancelada',
              'deleted',
              'excluido',
              'inactive',
              'inativo'
            )

            AND (
              ${excludePlanId}::bigint
              IS NULL

              OR

              id <>
                ${excludePlanId}
            )
        ),


        daily_plans AS (
          SELECT
            d.planned_date,
            d.material_name,
            d.material_code,
            d.machine_name,
            d.planned_unit,

            SUM(
              d.planned_qty
            ) AS planned_qty

          FROM production_plan_days d

          JOIN active_plans p
            ON p.id =
               d.plan_id

          WHERE
            d.planned_qty > 0

          GROUP BY
            d.planned_date,
            d.material_name,
            d.material_code,
            d.machine_name,
            d.planned_unit
        ),


        legacy_fallback AS (
          SELECT
            p.start_date
              AS planned_date,

            p.material_name,
            p.material_code,
            p.machine_name,
            p.planned_unit,

            SUM(
              p.planned_qty
            ) AS planned_qty

          FROM active_plans p

          WHERE
            p.planned_qty > 0

            AND NOT EXISTS (
              SELECT
                1

              FROM production_plan_days d

              WHERE
                d.plan_id = p.id

                AND

                d.planned_qty > 0
            )

          GROUP BY
            p.start_date,
            p.material_name,
            p.material_code,
            p.machine_name,
            p.planned_unit
        ),


        planned AS (
          SELECT
            *

          FROM daily_plans

          UNION ALL

          SELECT
            *

          FROM legacy_fallback
        )


        SELECT
          p.planned_date,

          material_match.id
            AS material_id,

          machine_location.location_id,

          SUM(
            p.planned_qty
          ) AS planned_qty

        FROM planned p


        JOIN LATERAL (
          SELECT
            m.id

          FROM materials m

          WHERE
            m.active = true

            AND (
              LOWER(
                TRIM(m.name)
              )
              =
              LOWER(
                TRIM(
                  p.material_name
                )
              )

              OR

              (
                NULLIF(
                  TRIM(
                    p.material_code
                  ),
                  ''
                )
                IS NOT NULL

                AND

                p.material_code
                  =
                  ANY(m.codes)
              )
            )

          ORDER BY
            m.id

          LIMIT 1
        )
        material_match
          ON true


        LEFT JOIN LATERAL (
          SELECT
            m.location_id

          FROM machines m

          WHERE
            LOWER(
              TRIM(m.name)
            )
            =
            LOWER(
              TRIM(
                p.machine_name
              )
            )

          ORDER BY
            m.active DESC,
            m.id

          LIMIT 1
        )
        machine_location
          ON true


        WHERE
          machine_location.location_id
          IS NOT NULL


        GROUP BY
          p.planned_date,
          material_match.id,
          machine_location.location_id
      `,


      db`
        SELECT
          material_id,
          input_material_id,
          qty_per_output,
          production_model_name

        FROM material_inputs
      `,


      /*
       * SOMENTE A FOTOGRAFIA NASAJON
       * MAIS RECENTE.
       */
      db`
        SELECT
          s.import_id,
          s.establishment,
          s.product_code,
          s.old_product_code,
          s.fiscal_balance_unit,
          s.error_balance_unit,
          s.orders_unit,
          s.future_sales_pending_unit,
          s.sales_unit

        FROM stock_snapshot s

        JOIN import_history h
          ON h.id =
             s.import_id

        WHERE
          h.status = 'success'

          AND

          s.import_id = (
            SELECT
              id

            FROM import_history

            WHERE
              status = 'success'

            ORDER BY
              created_at DESC,
              id DESC

            LIMIT 1
          )
      `,


      /*
       * Correcao manual por
       * MATERIAL + LOCAL.
       */
      db`
        SELECT
          material_id,
          location_id,
          correction_qty,
          updated_at,
          updated_by_user_id,
          updated_by_user_name

        FROM stock_location_corrections
      `,


      db`
        SELECT
          id,
          filename,
          status,
          total_rows,
          finished_at,
          created_at,
          period_start,
          period_end,
          business_days

        FROM import_history

        WHERE
          status = 'success'

        ORDER BY
          created_at DESC,
          id DESC

        LIMIT 1
      `
    ]);


  const orderedLocations =
    sortLocations(
      locations
    );


  const rows =
    buildCurrentStockBalances({
      materials,

      locations:
        orderedLocations,

      stockRows,

      correctionRows,

      inventories,

      productionLaunches,

      sales,

      plannedRows,

      materialInputs
    });


  return {
    locations:
      orderedLocations,

    rows,

    lastImport:
      lastImportRows[0]
      ||
      null
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
    ALTER TABLE stock_transport_records
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS cancel_reason TEXT
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

router.get('/current', requirePermission('stock:read'), async (req, res, next) => {
  try {
    const db = requireDb();
    const context = await loadCurrentStockContext(db);
    res.json(context);
  } catch (error) {
    next(error);
  }
});

router.get('/current/:materialId/:locationId', requirePermission('stock:read'), async (req, res, next) => {
  try {
    const db = requireDb();
    const context = await loadCurrentStockContext(db);
    const row = context.rows.find(item => (
      String(item.materialId) === String(req.params.materialId)
      && String(item.locationId) === String(req.params.locationId)
    ));
    if (!row) return res.status(404).json({ error: 'Saldo nao encontrado.' });
    res.json({ ...row, lastImport: context.lastImport });
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
        SELECT
          s.establishment,
          s.product_code,
          s.old_product_code,
          s.fiscal_balance_unit,
          s.error_balance_unit,
          s.sales_unit

        FROM stock_snapshot s

        JOIN import_history h
          ON h.id = s.import_id

        WHERE
          h.status = 'success'

          AND

          s.import_id = (
            SELECT
              id

            FROM import_history

            WHERE
              status = 'success'

            ORDER BY
              created_at DESC,
              id DESC

            LIMIT 1
          )
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
      SELECT r.id, r.transport_date, r.material_id, r.origin_location_id, r.destination_location_id,
             r.quantity, r.invoice_number, r.notes, r.user_id, r.created_at,
             r.status, r.canceled_at, r.cancel_reason,
             m.name AS material_name, m.codes AS material_codes, m.primary_unit,
             m.secondary_unit, m.primary_to_secondary_factor,
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
    const originLocationId = Number(req.body.originLocationId);
    const destinationLocationId = Number(req.body.destinationLocationId);
    const invoiceNumber = String(req.body.invoiceNumber || '').trim() || null;
    const notes = String(req.body.notes || '').trim() || null;
    const userId = req.user?.id || null;
    const items = Array.isArray(req.body.items) && req.body.items.length
      ? req.body.items
      : [{ materialId: req.body.materialId, quantity: req.body.quantity }];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(transportDate) || !originLocationId || !destinationLocationId || !items.length) {
      return res.status(400).json({ error: 'Data, material, locais e quantidade sao obrigatorios.' });
    }
    if (originLocationId === destinationLocationId) {
      return res.status(400).json({ error: 'Local de origem e destino devem ser diferentes.' });
    }
    const normalizedItems = items.map(item => ({
      materialId: Number(item.materialId),
      quantity: toNumber(item.quantity)
    }));
    if (normalizedItems.some(item => !item.materialId || item.quantity <= 0)) {
      return res.status(400).json({ error: 'Material e quantidade sao obrigatorios.' });
    }

    const rows = await db.begin(async tx => {
      const inserted = [];
      for (const item of normalizedItems) {
        const [row] = await tx`
          INSERT INTO stock_transport_records (
            transport_date, material_id, origin_location_id, destination_location_id,
            quantity, invoice_number, notes, user_id
          )
          VALUES (
            ${transportDate}, ${item.materialId}, ${originLocationId}, ${destinationLocationId},
            ${item.quantity}, ${invoiceNumber}, ${notes}, ${userId}
          )
          RETURNING *
        `;
        inserted.push(row);
      }
      await recordAuditLog(tx, {
        user: req.user,
        action: 'Transporte registrado',
        module: 'Lancamentos',
        description: `Registrou transporte com ${inserted.length} material(is), nota ${invoiceNumber || '-'}, em ${transportDate}.`,
        recordRef: inserted.map(row => row.id).join(',')
      });
      return inserted;
    });
    res.status(201).json(rows.length === 1 ? rows[0] : rows);
  } catch (error) {
    next(error);
  }
});

router.put('/manual-transports/:id', requirePermission('launches:write'), async (req, res, next) => {
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

    if (!/^\d{4}-\d{2}-\d{2}$/.test(transportDate) || !materialId || !originLocationId || !destinationLocationId || quantity <= 0) {
      return res.status(400).json({ error: 'Data, material, locais e quantidade sao obrigatorios.' });
    }
    if (originLocationId === destinationLocationId) {
      return res.status(400).json({ error: 'Local de origem e destino devem ser diferentes.' });
    }

    const [row] = await db`
      UPDATE stock_transport_records
      SET transport_date = ${transportDate},
          material_id = ${materialId},
          origin_location_id = ${originLocationId},
          destination_location_id = ${destinationLocationId},
          quantity = ${quantity},
          invoice_number = ${invoiceNumber},
          notes = ${notes}
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!row) return res.status(404).json({ error: 'Transporte nao encontrado.' });
    await recordAuditLog(db, {
      user: req.user,
      action: 'Transporte editado',
      module: 'Lancamentos',
      description: `Editou transporte ${row.id}, nota ${invoiceNumber || '-'}, em ${transportDate}.`,
      recordRef: row.id
    });
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.post('/manual-transports/:id/cancel', requirePermission('launches:write'), async (req, res, next) => {
  try {
    const db = requireDb();
    await ensureManualLaunchTables(db);
    const reason = String(req.body.reason || 'Cancelado pelo usuario').trim();
    const [row] = await db`
      UPDATE stock_transport_records
      SET status = 'canceled',
          canceled_at = now(),
          cancel_reason = ${reason}
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!row) return res.status(404).json({ error: 'Transporte nao encontrado.' });
    await recordAuditLog(db, {
      user: req.user,
      action: 'Transporte cancelado',
      module: 'Lancamentos',
      description: `Cancelou transporte ${row.id}, nota ${row.invoice_number || '-'}. Motivo: ${reason}.`,
      recordRef: row.id
    });
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.delete('/manual-transports/:id', requirePermission('launches:write'), requireSuperAdmin, async (req, res, next) => {
  try {
    const db = requireDb();
    await ensureManualLaunchTables(db);
    const [row] = await db`
      DELETE FROM stock_transport_records
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!row) return res.status(204).end();
    await recordAuditLog(db, {
      user: req.user,
      action: 'Exclusao de transporte',
      module: 'Lancamentos',
      description: `Excluiu definitivamente transporte ${row.id}, nota ${row.invoice_number || '-'}.`,
      recordRef: row.id
    });
    res.json(row);
  } catch (error) {
    next(error);
  }
});

function purchaseStockQuantity(material, totalWeightKg) {
  const primaryUnit = normalizeText(material?.primary_unit);
  const secondaryUnit = normalizeText(material?.secondary_unit);
  const factor = toNumber(material?.primary_to_secondary_factor);
  const weight = toNumber(totalWeightKg);

  if (!(weight > 0)) return null;

  if (primaryUnit === 'kg') {
    return roundPurchaseQty(weight);
  }

  if (
    primaryUnit === 'un'
    && secondaryUnit === 'kg'
    && factor > 0
  ) {
    return roundPurchaseQty(
      weight / factor
    );
  }

  return null;
}

async function normalizePurchaseItems(
  db,
  rawItems = []
) {
  const sourceItems =
    Array.isArray(rawItems)
      ? rawItems
      : [];

  if (!sourceItems.length) {
    return {
      error:
        'Adicione pelo menos um material na compra.'
    };
  }

  const items = [];

  for (
    let itemIndex = 0;
    itemIndex < sourceItems.length;
    itemIndex += 1
  ) {
    const source =
      sourceItems[itemIndex] || {};

    const materialId =
      Number(source.materialId);

    const locationId =
      Number(source.locationId);

    const rawLots =
      Array.isArray(source.lots)
        ? source.lots
        : [];

    if (!materialId || !locationId) {
      return {
        error:
          'Material e local de entrada sao obrigatorios em todos os itens.'
      };
    }

    if (!rawLots.length) {
      return {
        error:
          'Cada material precisa ter pelo menos um lote / UD.'
      };
    }

    const [material] = await db`
      SELECT
        id,
        name,
        primary_unit,
        secondary_unit,
        primary_to_secondary_factor
      FROM materials
      WHERE id = ${materialId}
        AND active = true
      LIMIT 1
    `;

    const [location] = await db`
      SELECT id
      FROM locations
      WHERE id = ${locationId}
        AND active = true
      LIMIT 1
    `;

    if (!material) {
      return {
        error:
          'Material da compra nao encontrado ou inativo.'
      };
    }

    if (!location) {
      return {
        error:
          'Local de entrada nao encontrado ou inativo.'
      };
    }

    const lots = [];

    for (
      let lotIndex = 0;
      lotIndex < rawLots.length;
      lotIndex += 1
    ) {
      const lot =
        rawLots[lotIndex] || {};

      const lotNumber =
        String(
          lot.lotNumber || ''
        ).trim();

      const heatNumber =
        String(
          lot.heatNumber || ''
        ).trim();

      const steelGrade =
        String(
          lot.steelGrade || ''
        ).trim();

      const weightKg =
        roundPurchaseQty(
          lot.weightKg,
          3
        );

      const tensileStrengthMpa =
        roundPurchaseQty(
          lot.tensileStrengthMpa,
          3
        );

      if (
        !lotNumber
        || !heatNumber
        || !steelGrade
        || !(weightKg > 0)
        || !(tensileStrengthMpa > 0)
      ) {
        return {
          error:
            'Preencha lote / UD, peso, corrida, limite de resistencia e grau / qualidade em todos os lotes.'
        };
      }

      lots.push({
        lotNumber,
        weightKg,
        heatNumber,
        tensileStrengthMpa,
        steelGrade,
        sortOrder: lotIndex
      });
    }

    const totalWeightKg =
      roundPurchaseQty(
        lots.reduce(
          (sum, lot) =>
            sum + lot.weightKg,
          0
        ),
        3
      );

    const stockQuantity =
      purchaseStockQuantity(
        material,
        totalWeightKg
      );

    if (!(stockQuantity > 0)) {
      return {
        error:
          `Nao foi possivel converter o peso comprado para a unidade principal do material ${material.name}.`
      };
    }

    items.push({
      materialId,
      locationId,
      primaryUnit:
        material.primary_unit,
      totalWeightKg,
      stockQuantity,
      sortOrder: itemIndex,
      lots
    });
  }

  return {
    items
  };
}

function groupPurchaseRows(
  rows = []
) {
  const purchases =
    new Map();

  for (const row of rows) {
    const purchaseKey =
      String(
        row.purchase_id
      );

    if (
      !purchases.has(
        purchaseKey
      )
    ) {
      purchases.set(
        purchaseKey,
        {
          id:
            row.purchase_id,

          purchase_date:
            row.purchase_date,

          supplier:
            row.supplier,

          invoice_number:
            row.invoice_number,

          certificate_number:
            row.certificate_number,

          invoice_total_weight_kg:
            row.invoice_total_weight_kg,

          notes:
            row.notes,

          user_id:
            row.user_id,

          created_at:
            row.created_at,

          updated_at:
            row.updated_at,

          items: [],

          _items:
            new Map()
        }
      );
    }

    const purchase =
      purchases.get(
        purchaseKey
      );

    if (
      !row.purchase_item_id
    ) {
      continue;
    }

    const itemKey =
      String(
        row.purchase_item_id
      );

    if (
      !purchase._items.has(
        itemKey
      )
    ) {
      const item = {
        id:
          row.purchase_item_id,

        material_id:
          row.material_id,

        material_name:
          row.material_name,

        material_codes:
          row.material_codes ||
          [],

        location_id:
          row.location_id,

        location_name:
          row.location_name,

        stock_quantity:
          row.stock_quantity,

        primary_unit:
          row.primary_unit,

        total_weight_kg:
          row.item_total_weight_kg,

        lots: []
      };

      purchase._items.set(
        itemKey,
        item
      );

      purchase.items.push(
        item
      );
    }

    if (
      row.purchase_lot_id
    ) {
      purchase._items
        .get(itemKey)
        .lots
        .push({
          id:
            row.purchase_lot_id,

          lot_number:
            row.lot_number,

          weight_kg:
            row.weight_kg,

          heat_number:
            row.heat_number,

          tensile_strength_mpa:
            row.tensile_strength_mpa,

          steel_grade:
            row.steel_grade
        });
    }
  }

  return [
    ...purchases.values()
  ].map(purchase => {
    delete purchase._items;

    return purchase;
  });
}

router.get(
  '/material-purchases',
  requirePermission(
    'launches:read'
  ),
  async (
    req,
    res,
    next
  ) => {
    try {
      const db =
        requireDb();

      const rows =
        await db`
          WITH recent AS (
            SELECT *
            FROM purchase_records
            ORDER BY
              purchase_date DESC,
              created_at DESC,
              id DESC
            LIMIT 200
          )

          SELECT
            p.id
              AS purchase_id,

            p.purchase_date,

            p.supplier,

            p.invoice_number,

            p.certificate_number,

            p.invoice_total_weight_kg,

            p.notes,

            p.user_id,

            p.created_at,

            p.updated_at,

            i.id
              AS purchase_item_id,

            i.material_id,

            i.location_id,

            i.stock_quantity,

            i.primary_unit,

            i.total_weight_kg
              AS item_total_weight_kg,

            m.name
              AS material_name,

            m.codes
              AS material_codes,

            loc.name
              AS location_name,

            lot.id
              AS purchase_lot_id,

            lot.lot_number,

            lot.weight_kg,

            lot.heat_number,

            lot.tensile_strength_mpa,

            lot.steel_grade

          FROM recent p

          LEFT JOIN purchase_items i
            ON i.purchase_id = p.id

          LEFT JOIN materials m
            ON m.id = i.material_id

          LEFT JOIN locations loc
            ON loc.id = i.location_id

          LEFT JOIN purchase_lots lot
            ON lot.purchase_item_id = i.id

          ORDER BY
            p.purchase_date DESC,
            p.created_at DESC,
            p.id DESC,
            i.sort_order,
            i.id,
            lot.sort_order,
            lot.id
        `;

      res.json(
        groupPurchaseRows(
          rows
        )
      );
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/material-purchases',
  requirePermission(
    'launches:write'
  ),
  async (
    req,
    res,
    next
  ) => {
    try {
      const db =
        requireDb();

      const purchaseDate =
        String(
          req.body.purchaseDate ||
          ''
        ).slice(
          0,
          10
        );

      const supplier =
        String(
          req.body.supplier ||
          ''
        ).trim();

      const invoiceNumber =
        String(
          req.body.invoiceNumber ||
          ''
        ).trim();

      const certificateNumber =
        String(
          req.body.certificateNumber ||
          ''
        ).trim();

      const invoiceTotalWeightKg =
        roundPurchaseQty(
          req.body
            .invoiceTotalWeightKg,
          3
        );

      const notes =
        String(
          req.body.notes ||
          ''
        ).trim() ||
        null;

      const userId =
        req.user?.id ||
        null;

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          purchaseDate
        )
        || !supplier
        || !invoiceNumber
        || !certificateNumber
        || !(invoiceTotalWeightKg > 0)
      ) {
        return res
          .status(400)
          .json({
            error:
              'Data, fornecedor, nota fiscal, certificado e peso total da nota fiscal sao obrigatorios.'
          });
      }

      const normalized =
        await normalizePurchaseItems(
          db,
          req.body.items
        );

      if (
        normalized.error
      ) {
        return res
          .status(400)
          .json({
            error:
              normalized.error
          });
      }

      const lotsWeightKg =
        roundPurchaseQty(
          normalized.items
            .reduce(
              (
                sum,
                item
              ) =>
                sum +
                item.totalWeightKg,
              0
            ),
          3
        );

      if (
        Math.abs(
          lotsWeightKg -
          invoiceTotalWeightKg
        ) > 0.001
      ) {
        return res
          .status(400)
          .json({
            error:
              `A soma dos lotes (${lotsWeightKg} kg) precisa ser igual ao peso total da nota fiscal (${invoiceTotalWeightKg} kg).`
          });
      }

      const purchase =
        await db.begin(
          async tx => {
            const [header] =
              await tx`
                INSERT INTO purchase_records (
                  purchase_date,
                  supplier,
                  invoice_number,
                  certificate_number,
                  invoice_total_weight_kg,
                  notes,
                  user_id
                )
                VALUES (
                  ${purchaseDate},
                  ${supplier},
                  ${invoiceNumber},
                  ${certificateNumber},
                  ${invoiceTotalWeightKg},
                  ${notes},
                  ${userId}
                )
                RETURNING *
              `;

            for (
              const item
              of normalized.items
            ) {
              const [insertedItem] =
                await tx`
                  INSERT INTO purchase_items (
                    purchase_id,
                    material_id,
                    location_id,
                    stock_quantity,
                    primary_unit,
                    total_weight_kg,
                    sort_order
                  )
                  VALUES (
                    ${header.id},
                    ${item.materialId},
                    ${item.locationId},
                    ${item.stockQuantity},
                    ${item.primaryUnit},
                    ${item.totalWeightKg},
                    ${item.sortOrder}
                  )
                  RETURNING id
                `;

              for (
                const lot
                of item.lots
              ) {
                await tx`
                  INSERT INTO purchase_lots (
                    purchase_item_id,
                    lot_number,
                    weight_kg,
                    heat_number,
                    tensile_strength_mpa,
                    steel_grade,
                    sort_order
                  )
                  VALUES (
                    ${insertedItem.id},
                    ${lot.lotNumber},
                    ${lot.weightKg},
                    ${lot.heatNumber},
                    ${lot.tensileStrengthMpa},
                    ${lot.steelGrade},
                    ${lot.sortOrder}
                  )
                `;
              }
            }

            await recordAuditLog(
              tx,
              {
                user:
                  req.user,

                action:
                  'Compra registrada',

                module:
                  'Lancamentos',

                description:
                  `Registrou compra de ${normalized.items.length} material(is), fornecedor ${supplier}, nota ${invoiceNumber}, em ${purchaseDate}.`,

                recordRef:
                  header.id
              }
            );

            return header;
          }
        );

      res
        .status(201)
        .json(
          purchase
        );
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/material-purchases/:id',
  requirePermission(
    'launches:write'
  ),
  async (
    req,
    res,
    next
  ) => {
    try {
      const db =
        requireDb();

      const purchaseDate =
        String(
          req.body.purchaseDate ||
          ''
        ).slice(
          0,
          10
        );

      const supplier =
        String(
          req.body.supplier ||
          ''
        ).trim();

      const invoiceNumber =
        String(
          req.body.invoiceNumber ||
          ''
        ).trim();

      const certificateNumber =
        String(
          req.body.certificateNumber ||
          ''
        ).trim();

      const invoiceTotalWeightKg =
        roundPurchaseQty(
          req.body
            .invoiceTotalWeightKg,
          3
        );

      const notes =
        String(
          req.body.notes ||
          ''
        ).trim() ||
        null;

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          purchaseDate
        )
        || !supplier
        || !invoiceNumber
        || !certificateNumber
        || !(invoiceTotalWeightKg > 0)
      ) {
        return res
          .status(400)
          .json({
            error:
              'Data, fornecedor, nota fiscal, certificado e peso total da nota fiscal sao obrigatorios.'
          });
      }

      const normalized =
        await normalizePurchaseItems(
          db,
          req.body.items
        );

      if (
        normalized.error
      ) {
        return res
          .status(400)
          .json({
            error:
              normalized.error
          });
      }

      const lotsWeightKg =
        roundPurchaseQty(
          normalized.items
            .reduce(
              (
                sum,
                item
              ) =>
                sum +
                item.totalWeightKg,
              0
            ),
          3
        );

      if (
        Math.abs(
          lotsWeightKg -
          invoiceTotalWeightKg
        ) > 0.001
      ) {
        return res
          .status(400)
          .json({
            error:
              `A soma dos lotes (${lotsWeightKg} kg) precisa ser igual ao peso total da nota fiscal (${invoiceTotalWeightKg} kg).`
          });
      }

      const result =
        await db.begin(
          async tx => {
            const [header] =
              await tx`
                UPDATE purchase_records

                SET
                  purchase_date =
                    ${purchaseDate},

                  supplier =
                    ${supplier},

                  invoice_number =
                    ${invoiceNumber},

                  certificate_number =
                    ${certificateNumber},

                  invoice_total_weight_kg =
                    ${invoiceTotalWeightKg},

                  notes =
                    ${notes},

                  updated_at =
                    now()

                WHERE id =
                  ${req.params.id}

                RETURNING *
              `;

            if (!header) {
              return null;
            }

            await tx`
              DELETE FROM purchase_items
              WHERE purchase_id =
                ${header.id}
            `;

            for (
              const item
              of normalized.items
            ) {
              const [insertedItem] =
                await tx`
                  INSERT INTO purchase_items (
                    purchase_id,
                    material_id,
                    location_id,
                    stock_quantity,
                    primary_unit,
                    total_weight_kg,
                    sort_order
                  )
                  VALUES (
                    ${header.id},
                    ${item.materialId},
                    ${item.locationId},
                    ${item.stockQuantity},
                    ${item.primaryUnit},
                    ${item.totalWeightKg},
                    ${item.sortOrder}
                  )
                  RETURNING id
                `;

              for (
                const lot
                of item.lots
              ) {
                await tx`
                  INSERT INTO purchase_lots (
                    purchase_item_id,
                    lot_number,
                    weight_kg,
                    heat_number,
                    tensile_strength_mpa,
                    steel_grade,
                    sort_order
                  )
                  VALUES (
                    ${insertedItem.id},
                    ${lot.lotNumber},
                    ${lot.weightKg},
                    ${lot.heatNumber},
                    ${lot.tensileStrengthMpa},
                    ${lot.steelGrade},
                    ${lot.sortOrder}
                  )
                `;
              }
            }

            await recordAuditLog(
              tx,
              {
                user:
                  req.user,

                action:
                  'Compra editada',

                module:
                  'Lancamentos',

                description:
                  `Editou compra ${header.id}, fornecedor ${supplier}, nota ${invoiceNumber}.`,

                recordRef:
                  header.id
              }
            );

            return header;
          }
        );

      if (!result) {
        return res
          .status(404)
          .json({
            error:
              'Compra nao encontrada.'
          });
      }

      res.json(
        result
      );
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/material-purchases/:id',
  requirePermission(
    'launches:write'
  ),
  requireSuperAdmin,
  async (
    req,
    res,
    next
  ) => {
    try {
      const db =
        requireDb();

      const [row] =
        await db`
          DELETE FROM purchase_records
          WHERE id =
            ${req.params.id}
          RETURNING *
        `;

      if (!row) {
        return res
          .status(204)
          .end();
      }

      await recordAuditLog(
        db,
        {
          user:
            req.user,

          action:
            'Exclusao de compra',

          module:
            'Lancamentos',

          description:
            `Excluiu definitivamente compra ${row.id}, fornecedor ${row.supplier}, nota ${row.invoice_number}.`,

          recordRef:
            row.id
        }
      );

      res.json(
        row
      );
    } catch (error) {
      next(error);
    }
  }
);
router.put(
  '/current/corrections',
  requirePermission('stock:write'),
  async (req, res, next) => {
    try {
      const materialId =
        Number(
          req.body.materialId
        );


      const locationId =
        Number(
          req.body.locationId
        );


      const correctionQty =
        toNumber(
          req.body.correctionQty
        );


      const notes =
        String(
          req.body.notes
          ||
          ''
        ).trim()
        ||
        null;


      if (
        !materialId
        ||
        !locationId
      ) {
        return res
          .status(400)
          .json({
            error:
              'Material e local sao obrigatorios.'
          });
      }


      const db =
        requireDb();


      const user =
        auditUser(
          req.user
        );


      const [row] =
        await db`
          INSERT INTO stock_location_corrections (
            material_id,
            location_id,
            correction_qty,
            notes,
            updated_by_user_id,
            updated_by_user_name,
            updated_at
          )

          VALUES (
            ${materialId},
            ${locationId},
            ${correctionQty},
            ${notes},
            ${user.id || null},
            ${displayUserName(req.user)},
            now()
          )

          ON CONFLICT (
            material_id,
            location_id
          )

          DO UPDATE SET
            correction_qty =
              EXCLUDED.correction_qty,

            notes =
              EXCLUDED.notes,

            updated_by_user_id =
              EXCLUDED.updated_by_user_id,

            updated_by_user_name =
              EXCLUDED.updated_by_user_name,

            updated_at =
              now()

          RETURNING *
        `;


      await recordAuditLog(
        db,
        {
          user:
            req.user,

          action:
            'Correcao de estoque',

          module:
            'Estoque',

          description:
            `Atualizou correcao do material ${materialId} no local ${locationId} para ${correctionQty}.`,

          recordRef:
            row.id
        }
      );


      res.json(
        row
      );
    } catch (error) {
      next(error);
    }
  }
);
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
