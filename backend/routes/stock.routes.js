import { Router } from 'express';
import { requireDb } from '../db.js';

const router = Router();

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
