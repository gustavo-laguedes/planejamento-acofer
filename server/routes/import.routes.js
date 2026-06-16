import { Router } from 'express';
import multer from 'multer';
import { requireDb } from '../db.js';
import { importStockCsv } from '../../services/csvImport.service.js';
import { requirePermission } from './middleware.js';
import { recordAuditLog } from '../audit.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

router.post('/csv', requirePermission('imports:write'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo CSV não enviado.' });
    const result = await importStockCsv({ buffer: req.file.buffer, filename: req.file.originalname, user: req.user });
    const db = requireDb();
    await recordAuditLog(db, {
      user: req.user,
      action: 'Importação de estoque',
      module: 'Estoque',
      description: `Importou estoque do arquivo ${req.file.originalname} com ${result.totalRows} registros`,
      recordRef: result.id
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/', requirePermission('log:read'), async (req, res, next) => {
  try {
    const db = requireDb();
    const rows = await db`
      SELECT id, filename, total_rows, status, error_message, started_at, finished_at, created_at, user_id, user_name
      FROM import_history
      ORDER BY created_at DESC
      LIMIT 100
    `;
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

export default router;
