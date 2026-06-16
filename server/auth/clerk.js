import crypto from 'crypto';
import { requireDb } from '../db.js';

const SUPER_ADMIN_ROLE = 'Super Admin';
const USER_ROLES = ['Super Admin', 'PCP', 'Gerente', 'Diretor', 'Operador', 'Visualizador'];
const USER_STATUSES = ['Ativo', 'Inativo'];

let jwksCache = null;
let jwksCacheUntil = 0;

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  return Buffer.from(padded, 'base64');
}

function decodeJwtPart(value) {
  return JSON.parse(decodeBase64Url(value).toString('utf8'));
}

function publicKeyFromJwk(jwk) {
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

function clerkIssuer() {
  if (process.env.CLERK_ISSUER) return process.env.CLERK_ISSUER.replace(/\/$/, '');
  if (process.env.CLERK_FRONTEND_API) {
    return `https://${process.env.CLERK_FRONTEND_API.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  }
  return '';
}

function jwksUrl(issuer) {
  return process.env.CLERK_JWKS_URL || `${issuer}/.well-known/jwks.json`;
}

async function getJwks(issuer) {
  const now = Date.now();
  if (jwksCache && jwksCacheUntil > now) return jwksCache;

  const response = await fetch(jwksUrl(issuer));
  if (!response.ok) throw new Error('Nao foi possivel carregar as chaves do Clerk.');
  jwksCache = await response.json();
  jwksCacheUntil = now + 10 * 60 * 1000;
  return jwksCache;
}

export async function verifyClerkToken(token) {
  const [headerPart, payloadPart, signaturePart] = String(token || '').split('.');
  if (!headerPart || !payloadPart || !signaturePart) throw new Error('Token ausente.');

  const header = decodeJwtPart(headerPart);
  const payload = decodeJwtPart(payloadPart);
  const issuer = clerkIssuer();

  if (!issuer) throw new Error('CLERK_ISSUER ou CLERK_FRONTEND_API nao configurado.');
  if (payload.iss !== issuer) throw new Error('Emissor do token invalido.');
  if (header.alg !== 'RS256') throw new Error('Algoritmo do token invalido.');

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp <= nowSeconds) throw new Error('Token expirado.');
  if (payload.nbf && payload.nbf > nowSeconds) throw new Error('Token ainda nao valido.');

  const audience = process.env.CLERK_JWT_AUDIENCE;
  if (audience) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean);
    if (!audiences.includes(audience)) throw new Error('Audiencia do token invalida.');
  }

  const jwks = await getJwks(issuer);
  const jwk = jwks.keys?.find(key => key.kid === header.kid);
  if (!jwk) throw new Error('Chave do token nao encontrada.');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerPart}.${payloadPart}`);
  verifier.end();

  if (!verifier.verify(publicKeyFromJwk(jwk), decodeBase64Url(signaturePart))) {
    throw new Error('Assinatura do token invalida.');
  }

  return payload;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function roleSlug(role) {
  return String(role || '').trim().toLowerCase().replace(/\s+/g, '_');
}

export function assertRole(role) {
  if (!USER_ROLES.includes(role)) {
    const error = new Error('Funcao invalida.');
    error.status = 400;
    throw error;
  }
}

export function assertStatus(status) {
  if (!USER_STATUSES.includes(status)) {
    const error = new Error('Status invalido.');
    error.status = 400;
    throw error;
  }
}

export function isSuperAdmin(user) {
  return user?.role === SUPER_ADMIN_ROLE || user?.role_slug === roleSlug(SUPER_ADMIN_ROLE);
}

export async function ensureInitialSuperAdmin() {
  const email = normalizeEmail(process.env.SUPER_ADMIN_EMAIL);
  if (!email) return null;

  const sql = requireDb();
  const name = String(process.env.SUPER_ADMIN_NAME || 'Super Admin').trim();
  const clerkUserId = String(process.env.SUPER_ADMIN_CLERK_USER_ID || '').trim() || null;

  const rows = await sql`
    INSERT INTO app_users (clerk_user_id, name, email, role, status, is_initial_super_admin)
    VALUES (${clerkUserId}, ${name}, ${email}, ${SUPER_ADMIN_ROLE}, 'Ativo', true)
    ON CONFLICT (email) DO UPDATE
    SET
      role = ${SUPER_ADMIN_ROLE},
      status = 'Ativo',
      is_initial_super_admin = true,
      clerk_user_id = COALESCE(app_users.clerk_user_id, EXCLUDED.clerk_user_id),
      updated_at = now()
    RETURNING *
  `;

  return rows[0];
}

async function getClerkUser(clerkUserId) {
  if (!process.env.CLERK_SECRET_KEY) return null;
  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`, {
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` }
  });
  if (!response.ok) return null;
  return response.json();
}

function primaryEmailFromClerkUser(user) {
  const primary = user?.email_addresses?.find(email => email.id === user.primary_email_address_id);
  return normalizeEmail(primary?.email_address || user?.email_addresses?.[0]?.email_address);
}

function displayNameFromClerkUser(user, fallback = '') {
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  return fullName || user?.username || fallback || primaryEmailFromClerkUser(user);
}

export async function getProfileForTokenPayload(payload) {
  const sql = requireDb();
  await ensureInitialSuperAdmin();

  let rows = await sql`
    SELECT *
    FROM app_users
    WHERE clerk_user_id = ${payload.sub}
    LIMIT 1
  `;

  if (rows[0]) return rows[0];

  const clerkUser = await getClerkUser(payload.sub);
  const email = primaryEmailFromClerkUser(clerkUser);

  if (!email) return null;

  rows = await sql`
    UPDATE app_users
    SET
      clerk_user_id = ${payload.sub},
      name = COALESCE(NULLIF(name, ''), ${displayNameFromClerkUser(clerkUser, email)}),
      updated_at = now()
    WHERE email = ${email}
    RETURNING *
  `;

  return rows[0] || null;
}

export async function inviteClerkUser({ email, name, role }) {
  if (!process.env.CLERK_SECRET_KEY) {
    const error = new Error('CLERK_SECRET_KEY nao configurada.');
    error.status = 500;
    throw error;
  }

  const payload = {
    email_address: normalizeEmail(email),
    public_metadata: { name, role }
  };

  if (process.env.CLERK_INVITATION_REDIRECT_URL) {
    payload.redirect_url = process.env.CLERK_INVITATION_REDIRECT_URL;
  }

  const response = await fetch('https://api.clerk.com/v1/invitations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.errors?.[0]?.message || 'Falha ao criar convite no Clerk.');
    error.status = response.status;
    throw error;
  }

  return body;
}

export { SUPER_ADMIN_ROLE, USER_ROLES, USER_STATUSES };
