const RETENTION_DAYS = 90;
let lastCleanupAt = 0;

function userId(user) {
  const id = Number(user?.id || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function text(value, fallback = null) {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

export async function cleanupAuditLogs(db, { force = false } = {}) {
  if (!db) return;
  const now = Date.now();
  if (!force && now - lastCleanupAt < 60 * 60 * 1000) return;
  lastCleanupAt = now;

  await db`
    DELETE FROM audit_logs
    WHERE occurred_at < now() - INTERVAL '90 days'
  `;
}

export async function recordAuditLog(db, { user, action, module, description, recordRef = null }) {
  if (!db || !action || !module || !description) return;

  try {
    await cleanupAuditLogs(db);
    await db`
      INSERT INTO audit_logs (
        user_id, user_name, user_email, user_role, action, module, description, record_ref
      )
      VALUES (
        ${userId(user)},
        ${text(user?.name, text(user?.email, 'Sistema'))},
        ${text(user?.email)},
        ${text(user?.role)},
        ${text(action)},
        ${text(module)},
        ${text(description)},
        ${text(recordRef)}
      )
    `;
  } catch (error) {
    console.warn(`Falha ao registrar auditoria: ${error.message}`);
  }
}

export function auditUser(user) {
  return {
    id: userId(user),
    name: text(user?.name, text(user?.email, 'Sistema')),
    email: text(user?.email),
    role: text(user?.role)
  };
}
