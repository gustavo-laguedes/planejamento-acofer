import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.routes.js';
import importRoutes from './routes/import.routes.js';
import stockRoutes from './routes/stock.routes.js';
import productivityRoutes from './routes/productivity.routes.js';
import planningRoutes from './routes/planning.routes.js';
import actualsRoutes from './routes/actuals.routes.js';
import actualsExcelRoutes from './routes/actualsExcel.routes.js';
import locationsRoutes from './routes/locations.routes.js';
import machinesRoutes from './routes/machines.routes.js';
import materialsRoutes from './routes/materials.routes.js';
import materialTypesRoutes from './routes/materialTypes.routes.js';
import normsRoutes from './routes/norms.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import auditRoutes from './routes/audit.routes.js';
import { requireAnyPermission, requireAuth, requirePermission } from './routes/middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);
const frontendDir = path.resolve(__dirname, '..');
const allowedOrigins = new Set([
  'http://localhost:3000',
  ...String(process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
]);

const LINE_VERSION_EXTENSIONS = new Set([
  '.js',
  '.css',
  '.html',
  '.json',
  '.sql',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg'
]);

const LINE_VERSION_SOURCES = [
  path.join(frontendDir, 'app.js'),
  path.join(frontendDir, 'style.css'),
  path.join(frontendDir, 'index.html'),
  path.join(frontendDir, 'package.json'),
  path.join(frontendDir, 'pages'),
  path.join(frontendDir, 'shared'),
  path.join(frontendDir, 'services'),
  path.join(frontendDir, 'server'),
  path.join(frontendDir, 'assets')
];

function latestLineSourceMtime(target) {
  try {
    if (!fs.existsSync(target)) return 0;

    const stats = fs.statSync(target);

    if (stats.isFile()) {
      const extension = path.extname(target).toLowerCase();

      return LINE_VERSION_EXTENSIONS.has(extension)
        ? stats.mtimeMs
        : 0;
    }

    return fs.readdirSync(target, { withFileTypes: true })
      .reduce((latest, entry) => {
        if (
          entry.name === 'node_modules'
          || entry.name === '.git'
        ) {
          return latest;
        }

        return Math.max(
          latest,
          latestLineSourceMtime(
            path.join(target, entry.name)
          )
        );
      }, 0);
  } catch {
    return 0;
  }
}

function formatLineVersion(timestamp) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(timestamp));

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return `V${values.day}${values.month}${values.year}.${values.hour}${values.minute}`;
}

function currentLineVersion() {
  const modifiedAt = LINE_VERSION_SOURCES.reduce(
    (latest, target) =>
      Math.max(
        latest,
        latestLineSourceMtime(target)
      ),
    0
  );

  return formatLineVersion(
    modifiedAt || Date.now()
  );
}

function applyCors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-App-Session-Id');
  }

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
}

function requireStockRead(req, res, next) {
  if (req.method === 'GET' && req.path === '/materials-overview') {
    return requireAnyPermission(['stock:read', 'commercial:calendar'])(req, res, next);
  }
  return requirePermission('stock:read')(req, res, next);
}

function requireProductivityRead(req, res, next) {
  if (req.method === 'GET' && req.path === '/') {
    return requireAnyPermission(['matrix:read', 'commercial:calendar'])(req, res, next);
  }
  return requirePermission('matrix:read')(req, res, next);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(applyCors);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'Planejamento Aço-Fer' });
});

app.get('/api/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  res.json({
    version: currentLineVersion()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/imports', requireAuth, importRoutes);
app.use('/api/stock', requireAuth, requireStockRead, stockRoutes);
app.use('/api/productivity', requireAuth, requireProductivityRead, productivityRoutes);
app.use('/api/planning', requireAuth, requirePermission('planning:read'), planningRoutes);
app.use(
  '/api/actuals/excel',
  requireAuth,
  actualsExcelRoutes
);

app.use(
  '/api/actuals',
  requireAuth,
  actualsRoutes
);
app.use('/api/locations', requireAuth, requirePermission('registrations:read'), locationsRoutes);
app.use('/api/machines', requireAuth, requirePermission('registrations:read'), machinesRoutes);
app.use('/api/materials', requireAuth, requirePermission('registrations:read'), materialsRoutes);
app.use('/api/material-types', requireAuth, requirePermission('registrations:read'), materialTypesRoutes);
app.use('/api/norms', requireAuth, requirePermission('registrations:read'), normsRoutes);
app.use('/api/dashboard', requireAuth, requirePermission('productivity:read'), dashboardRoutes);
app.use('/api/audit', requireAuth, requirePermission('log:read'), auditRoutes);

app.use(express.static(frontendDir, {
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));
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
