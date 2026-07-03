import { getProfileForTokenPayload, isSuperAdmin, roleSlug, verifyClerkToken } from '../auth/clerk.js';
import { canAccess, permissionsForRole } from '../../shared/rbac.js';
import { requireDb } from '../db.js';

function sessionIdFromRequest(req) {
  return String(req.headers['x-app-session-id'] || '').trim();
}

export async function requireIdentity(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Sessao ausente.' });
  }

  try {
    const payload = await verifyClerkToken(token);
    const profile = await getProfileForTokenPayload(payload);

    if (!profile) {
      return res.status(403).json({ error: 'Usuario nao cadastrado no sistema.' });
    }

    if (profile.status !== 'Ativo') {
      return res.status(403).json({ error: 'Usuario inativo.' });
    }

    req.user = {
      id: profile.id,
      sub: payload.sub,
      clerkUserId: payload.sub,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      role_slug: roleSlug(profile.role),
      permissions: permissionsForRole(profile.role),
      is_initial_super_admin: profile.is_initial_super_admin
    };
    req.authPayload = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ error: error.message || 'Sessao invalida ou expirada.' });
  }
}

export async function requireAuth(req, res, next) {
  return requireIdentity(req, res, async error => {
    if (error) return next(error);
    const browserSessionId = sessionIdFromRequest(req);
    if (!browserSessionId) return res.status(401).json({ error: 'Identificador da sessão ausente.' });
    try {
      const db = requireDb();
      const [active] = await db`
        UPDATE app_users
        SET active_browser_session_id = COALESCE(active_browser_session_id, ${browserSessionId}),
            active_session_started_at = CASE
              WHEN active_browser_session_id IS NULL THEN now()
              ELSE active_session_started_at
            END,
            active_session_last_seen_at = now()
        WHERE id = ${req.user.id}
          AND (active_browser_session_id IS NULL OR active_browser_session_id = ${browserSessionId})
        RETURNING id
      `;
      if (!active) {
        return res.status(401).json({ error: 'Esta sessão foi encerrada por um login em outro navegador ou dispositivo.' });
      }
      req.browserSessionId = browserSessionId;
      return next();
    } catch (sessionError) {
      return next(sessionError);
    }
  });
}

export function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Acesso restrito ao Super Admin.' });
  }
  return next();
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!canAccess(req.user, permission)) {
      return res.status(403).json({ error: 'Permissao insuficiente para esta acao.' });
    }
    return next();
  };
}

export function requireAnyPermission(permissions) {
  return (req, res, next) => {
    if (!permissions.some(permission => canAccess(req.user, permission))) {
      return res.status(403).json({ error: 'Permissao insuficiente para esta acao.' });
    }
    return next();
  };
}
