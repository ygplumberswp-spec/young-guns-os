-- MANUAL TEST-DB ROLLBACK ONLY — not registered in drizzle journal.
-- Drizzle-kit does not support automatic down migrations.
-- Restores role_id from security_audit_logs written by 0094 (best-effort).
-- DO NOT run against production / live Young Guns data.

-- Restore users remapped by role_migration_batch1a (latest matching audit per user)
UPDATE users AS u
SET
  role_id = (s.metadata->>'fromRoleId')::uuid,
  updated_at = now()
FROM security_audit_logs AS s
WHERE s.action = 'role_migration_batch1a'
  AND s.metadata->>'migration' = '0094_canonical_role_matrix'
  AND s.entity_id = u.id::text
  AND s.metadata ? 'fromRoleId'
  AND (s.metadata->>'fromRoleId') ~* '^[0-9a-f-]{36}$'
  AND s.occurred_at = (
    SELECT MAX(s2.occurred_at)
    FROM security_audit_logs s2
    WHERE s2.action = 'role_migration_batch1a'
      AND s2.metadata->>'migration' = '0094_canonical_role_matrix'
      AND s2.entity_id = u.id::text
  );

-- Note: does not delete canonical role rows (Platform Owner / Company Owner / Manager / Accountant)
-- or reverse Member permission tighten. Re-seed permissions via ensureDefaultRoles after rollback if needed.
