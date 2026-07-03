import { Router } from 'express';
import { requireDb } from '../db.js';
import {
  USER_ROLES,
  USER_STATUSES,
  assertRole,
  assertStatus,
  ensureInitialSuperAdmin,
  inviteClerkUser,
  isSuperAdmin,
  roleSlug
} from '../auth/clerk.js';
import { requireAuth, requireIdentity, requirePermission } from './middleware.js';
import { permissionsForRole } from '../../shared/rbac.js';
import { recordAuditLog } from '../audit.js';

const router = Router();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function serializeUser(row) {
  return {
    id: row.id,
    clerkUserId: row.clerk_user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    isInitialSuperAdmin: row.is_initial_super_admin,
    invitedAt: row.invited_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

router.get('/config', (req, res) => {
  res.json({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || ''
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      roleSlug: req.user.role_slug,
      permissions: permissionsForRole(req.user.role),
      isSuperAdmin: isSuperAdmin(req.user)
    }
  });
});

router.post('/session/activate', requireIdentity, async (req, res, next) => {
  try {
    const browserSessionId = String(req.headers['x-app-session-id'] || '').trim();
    if (!browserSessionId) return res.status(400).json({ error: 'Identificador da sessão ausente.' });
    const sql = requireDb();
    await sql`
      UPDATE app_users
      SET active_browser_session_id = ${browserSessionId},
          active_session_started_at = now(),
          active_session_last_seen_at = now()
      WHERE id = ${req.user.id}
    `;
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/session/close', requireAuth, async (req, res, next) => {
  try {
    const sql = requireDb();
    await sql`
      UPDATE app_users
      SET active_browser_session_id = NULL,
          active_session_started_at = NULL,
          active_session_last_seen_at = now()
      WHERE id = ${req.user.id}
        AND active_browser_session_id = ${req.browserSessionId}
    `;
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/events/login', requireAuth, async (req, res, next) => {
  try {
    const sql = requireDb();
    await recordAuditLog(sql, {
      user: req.user,
      action: 'Login',
      module: 'Autenticação',
      description: `Login realizado por ${req.user.name || req.user.email}`,
      recordRef: req.user.id
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/events/logout', requireAuth, async (req, res, next) => {
  try {
    const sql = requireDb();
    await recordAuditLog(sql, {
      user: req.user,
      action: 'Logout',
      module: 'Autenticação',
      description: `Logout realizado por ${req.user.name || req.user.email}`,
      recordRef: req.user.id
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/users', requireAuth, requirePermission('users:manage'), async (req, res, next) => {
  try {
    await ensureInitialSuperAdmin();
    const sql = requireDb();
    const rows = await sql`
      SELECT *
      FROM app_users
      ORDER BY is_initial_super_admin DESC, name ASC
    `;
    res.json({
      roles: USER_ROLES,
      statuses: USER_STATUSES,
      users: rows.map(serializeUser)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/users', requireAuth, requirePermission('users:manage'), async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email);
    const role = String(req.body?.role || '').trim();
    const status = String(req.body?.status || 'Ativo').trim();

    if (!name || !email) {
      return res.status(400).json({ error: 'Nome e e-mail sao obrigatorios.' });
    }

    assertRole(role);
    assertStatus(status);

    const sql = requireDb();
    const existing = await sql`
      SELECT *
      FROM app_users
      WHERE email = ${email}
      LIMIT 1
    `;

    if (existing[0]) {
      return res.status(409).json({ error: 'Usuario ja cadastrado.' });
    }

    const invitation = await inviteClerkUser({ email, name, role });
    const rows = await sql`
      INSERT INTO app_users (name, email, role, status, clerk_invitation_id, invited_at)
      VALUES (${name}, ${email}, ${role}, ${status}, ${invitation.id || null}, now())
      RETURNING *
    `;

    await recordAuditLog(sql, {
      user: req.user,
      action: 'Criação de usuários',
      module: 'Usuários',
      description: `Criou usuário ${rows[0].name} (${rows[0].role})`,
      recordRef: rows[0].id
    });
    res.status(201).json({ user: serializeUser(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.patch('/users/:id', requireAuth, requirePermission('users:manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body?.name || '').trim();
    const role = String(req.body?.role || '').trim();
    const status = String(req.body?.status || '').trim();

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Usuario invalido.' });
    }

    if (!name) return res.status(400).json({ error: 'Nome e obrigatorio.' });
    assertRole(role);
    assertStatus(status);

    const sql = requireDb();
    const current = await sql`
      SELECT *
      FROM app_users
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!current[0]) return res.status(404).json({ error: 'Usuario nao encontrado.' });

    if (current[0].is_initial_super_admin && (roleSlug(role) !== 'super_admin' || status !== 'Ativo')) {
      return res.status(400).json({ error: 'O Super Admin inicial nao pode ser desativado ou perder acesso.' });
    }

    const rows = await sql`
      UPDATE app_users
      SET name = ${name}, role = ${role}, status = ${status}, updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;

    const previousStatus = current[0].status;
    const action = previousStatus !== 'Inativo' && status === 'Inativo'
      ? 'Desativação de usuários'
      : previousStatus === 'Inativo' && status === 'Ativo'
        ? 'Reativação de usuários'
        : 'Edição de usuários';
    const actionDescription = action === 'Desativação de usuários'
      ? `Desativou usuário ${rows[0].name} (${rows[0].role})`
      : action === 'Reativação de usuários'
        ? `Reativou usuário ${rows[0].name} (${rows[0].role})`
        : `Editou usuário ${rows[0].name} (${rows[0].role})`;
    await recordAuditLog(sql, {
      user: req.user,
      action,
      module: 'Usuários',
      description: actionDescription,
      recordRef: rows[0].id
    });

    res.json({ user: serializeUser(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/users/:id', requireAuth, requirePermission('users:manage'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Usuario invalido.' });
    }

    const sql = requireDb();
    const current = await sql`
      SELECT *
      FROM app_users
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!current[0]) return res.status(404).json({ error: 'Usuario nao encontrado.' });
    if (current[0].is_initial_super_admin) {
      return res.status(400).json({ error: 'O Super Admin inicial nao pode ser removido.' });
    }

    await sql`DELETE FROM app_users WHERE id = ${id}`;
    await recordAuditLog(sql, {
      user: req.user,
      action: 'Desativação de usuários',
      module: 'Usuários',
      description: `Removeu usuário ${current[0].name} (${current[0].role})`,
      recordRef: current[0].id
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
