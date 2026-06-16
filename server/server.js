import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.routes.js';
import importRoutes from './routes/import.routes.js';
import stockRoutes from './routes/stock.routes.js';
import productivityRoutes from './routes/productivity.routes.js';
import planningRoutes from './routes/planning.routes.js';
import actualsRoutes from './routes/actuals.routes.js';
import locationsRoutes from './routes/locations.routes.js';
import machinesRoutes from './routes/machines.routes.js';
import materialsRoutes from './routes/materials.routes.js';
import auditRoutes from './routes/audit.routes.js';
import { requireAuth, requirePermission } from './routes/middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);
const frontendDir = path.resolve(__dirname, '..');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'Planejamento Aço-Fer' });
});

app.use('/api/auth', authRoutes);
app.use('/api/imports', requireAuth, importRoutes);
app.use('/api/stock', requireAuth, requirePermission('stock:read'), stockRoutes);
app.use('/api/productivity', requireAuth, requirePermission('matrix:read'), productivityRoutes);
app.use('/api/planning', requireAuth, requirePermission('planning:read'), planningRoutes);
app.use('/api/actuals', requireAuth, actualsRoutes);
app.use('/api/locations', requireAuth, requirePermission('registrations:read'), locationsRoutes);
app.use('/api/machines', requireAuth, requirePermission('registrations:read'), machinesRoutes);
app.use('/api/materials', requireAuth, requirePermission('registrations:read'), materialsRoutes);
app.use('/api/audit', requireAuth, requirePermission('log:read'), auditRoutes);

app.use(express.static(frontendDir));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Erro interno do servidor'
  });
});

app.listen(port, () => {
  console.log(`Planejamento Aço-Fer rodando em http://localhost:${port}`);
});
