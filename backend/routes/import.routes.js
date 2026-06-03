import { Router } from 'express';
import multer from 'multer';
import { requireDb } from '../db.js';
import { importStockCsv } from '../services/csvImport.service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

router.post('/csv', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo CSV nao enviado.' });
    const result = await importStockCsv({ buffer: req.file.buffer, filename: req.file.originalname });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const db = requireDb();
    const rows = await db`
      SELECT id, filename, total_rows, status, error_message, started_at, finished_at, created_at
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
