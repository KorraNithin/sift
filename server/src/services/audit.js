import { nowIso } from '../db.js';

/**
 * Appends to the audit log. Entries hold IDs and codes only, never personal data,
 * so the log survives candidate erasure.
 */
export function audit(db, actor, action, entity, entityId, detail, at = nowIso()) {
  db.prepare(
    'INSERT INTO audit_log (at, actor_id, actor_name, actor_role, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    at,
    actor?.id ?? null,
    actor?.name ?? 'System',
    actor?.role ?? 'system',
    action,
    entity,
    String(entityId),
    detail ? JSON.stringify(detail) : null,
  );
}

/** Mock outbound notification: logged and audited, never sent anywhere. */
export function notify(db, to, subject, entityId) {
  console.log(`[mock-email] to=${to} subject="${subject}"`);
  audit(db, null, 'notification_sent', 'application', entityId, { to, subject, mock: true });
}
