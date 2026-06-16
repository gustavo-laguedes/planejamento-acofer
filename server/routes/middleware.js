import { getProfileForTokenPayload, isSuperAdmin, roleSlug, verifyClerkToken } from '../auth/clerk.js';
import { canAccess, permissionsForRole } from '../../shared/rbac.js';

export async function requireAuth(req, res, next) {
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
    return next();
  } catch (error) {
    return res.status(401).json({ error: error.message || 'Sessao invalida ou expirada.' });
  }
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
