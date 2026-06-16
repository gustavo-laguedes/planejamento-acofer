import { Router } from 'express';
import { requireDb } from '../db.js';
import { cleanupAuditLogs } from '../audit.js';

const router = Router();

function dateOnly(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

router.get('/', async (req, res, next) => {
  try {
    const db = requireDb();
    await cleanupAuditLogs(db);

    const startDate = dateOnly(req.query.startDate);
    const endDate = dateOnly(req.query.endDate);
    const startBoundary = startDate || '1900-01-01';
    const endBoundary = endDate || '2999-12-31';
    const user = String(req.query.user || '').trim();
    const userFilter = `%${user}%`;

    const rows = await db`
      SELECT id, occurred_at, user_id, user_name, user_email, user_role, action, module, description, record_ref
      FROM audit_logs
      WHERE occurred_at >= (${startBoundary}::date AT TIME ZONE 'America/Sao_Paulo')
        AND occurred_at < ((${endBoundary}::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')
        AND (${user} = '' OR user_name ILIKE ${userFilter} OR user_email ILIKE ${userFilter})
      ORDER BY occurred_at DESC
      LIMIT 500
    `;

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

export default router;
