-- TITAN Batch 1A finalize — Canonical role matrix + binding user remaps
-- IDEMPOTENT. Preserves users/memberships. Does not delete accounts.
-- Authority: immutable users.id + companies.id + saas_tenant_profiles.tenant_kind (NEVER email).
--
-- Binding mappings:
--   1. Owner + tenant_kind=platform_owner → Platform Owner
--   2. Owner in normal/customer tenants → Company Owner
--   3. Admin → Manager
--   4. Member → retain Member (permissions tightened to minimal non-sensitive)
--
-- SAFETY STOP: if any platform_owner tenant has >1 user with role name 'Owner',
-- this migration RAISE EXCEPTION and lists candidate user IDs (no remap applied).
--
-- DOWN: drizzle-kit does not auto-rollback. Manual test rollback:
--   packages/db/drizzle/0094_canonical_role_matrix.down.sql (test DB only)

-- ---------------------------------------------------------------------------
-- 0) Safety stop — ambiguous Platform Owner candidates
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  amb RECORD;
  ids text;
BEGIN
  FOR amb IN
    SELECT p.company_id, COUNT(*)::int AS owner_count
    FROM saas_tenant_profiles p
    INNER JOIN users u ON u.company_id = p.company_id
    INNER JOIN roles r ON r.id = u.role_id
    WHERE p.tenant_kind = 'platform_owner'
      AND r.name = 'Owner'
    GROUP BY p.company_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT string_agg(u.id::text, ',' ORDER BY u.id::text)
      INTO ids
    FROM users u
    INNER JOIN roles r ON r.id = u.role_id
    WHERE u.company_id = amb.company_id
      AND r.name = 'Owner';

    RAISE EXCEPTION
      'BATCH1A_PLATFORM_OWNER_AMBIGUOUS company_id=% owner_user_ids=% count=% — resolve manually before migrating (never use email)',
      amb.company_id, ids, amb.owner_count
      USING ERRCODE = 'P0001';
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Ensure canonical (+ kept legacy) system roles exist per company
-- ---------------------------------------------------------------------------
INSERT INTO roles (id, company_id, name, permissions, is_system, created_at, updated_at)
SELECT
  gen_random_uuid(),
  c.id,
  v.name,
  v.permissions,
  true,
  now(),
  now()
FROM companies c
CROSS JOIN (
  VALUES
    ('Platform Owner', '["*","platform:cross_tenant"]'::jsonb),
    ('Company Owner', '["*"]'::jsonb),
    ('Manager', '["company:manage","users:read","users:manage","settings:manage","customers:read","customers:write","jobs:read","jobs:write","dispatch:read","dispatch:write","finance:read","finance:write","inventory:read","inventory:write","fleet:read","fleet:write","integrations:read","integrations:manage","communications:read","communications:write","communications:manage","documents:read","documents:write","automation:read","automation:write","agents:read","agents:write","agents:manage","recruiting:read","recruiting:write","intelligence:read","intelligence:write","analytics:read","analytics:write","mobile:read","mobile:write","mobile:manage","orchestration:read","orchestration:write","sales:read","sales:write","marketing:read","marketing:write","leads:read","leads:write","voice:read","voice:write","voice_reception:read","voice_reception:write","voice_reception:manage","document_ai:read","document_ai:write","document_ai:manage","business_continuity:read","business_continuity:write","business_continuity:manage","search:read","search:write","search:manage","data_migration:read","data_migration:write","data_migration:manage","notifications:read","notifications:write","notifications:manage","customer_support:read","customer_support:write","workforce:read","workforce:write","procurement:read","procurement:write","executive:read","executive:write","knowledge:read","knowledge:write","bi:read","bi:write","portal:read","portal:manage","customer_experience:read","customer_experience:write","customer_experience:manage","quality:read","quality:write","communications_intelligence:read","communications_intelligence:write","asset_equipment:read","asset_equipment:write","asset_lifecycle:read","asset_lifecycle:write","asset_lifecycle:manage","workforce_intelligence:read","workforce_intelligence:write","workforce_intelligence:manage","legal_compliance:read","legal_compliance:write","legal_compliance:manage","financial_planning:read","financial_planning:write","financial_planning:manage","sales_intelligence:read","sales_intelligence:write","sales_intelligence:manage","marketing_intelligence:read","marketing_intelligence:write","marketing_intelligence:manage","service_delivery:read","service_delivery:write","service_delivery:manage","it_operations:read","it_operations:write","it_operations:manage","business_evolution:read","business_evolution:write","business_evolution:manage","app_builder:read","app_builder:write","app_builder:manage","industry_packs:read","industry_packs:write","industry_packs:manage","ai_orchestration:read","ai_orchestration:write","dispatch_intelligence:read","dispatch_intelligence:write","fleet_intelligence:read","fleet_intelligence:write","personal_communications:read","personal_communications:write","security:read","security:write","ops:read"]'::jsonb),
    ('Dispatcher', '["customers:read","customers:write","jobs:read","jobs:write","dispatch:read","dispatch:write","leads:read","leads:write","finance:read","communications:read","communications:write","documents:read","documents:write","portal:read","portal:manage","mobile:read","inventory:read","fleet:read","users:read","dispatch_intelligence:read","fleet_intelligence:read"]'::jsonb),
    ('Accountant', '["customers:read","finance:read","finance:write","documents:read","documents:write","integrations:read","integrations:manage","analytics:read","bi:read","financial_planning:read","financial_planning:write","financial_planning:manage","portal:read","notifications:read"]'::jsonb),
    ('Technician', '["mobile:read","mobile:write","jobs:read","jobs:write","documents:read","documents:write","communications:read","communications:write","inventory:read"]'::jsonb),
    ('Member', '["notifications:read","documents:read","communications:read","knowledge:read","search:read","portal:read"]'::jsonb)
) AS v(name, permissions)
WHERE NOT EXISTS (
  SELECT 1 FROM roles r
  WHERE r.company_id = c.id AND r.name = v.name
);

-- Sync permissions for system roles that already exist (idempotent tighten/refresh)
UPDATE roles AS r
SET
  permissions = v.permissions,
  is_system = true,
  updated_at = now()
FROM (
  VALUES
    ('Platform Owner', '["*","platform:cross_tenant"]'::jsonb),
    ('Company Owner', '["*"]'::jsonb),
    ('Manager', '["company:manage","users:read","users:manage","settings:manage","customers:read","customers:write","jobs:read","jobs:write","dispatch:read","dispatch:write","finance:read","finance:write","inventory:read","inventory:write","fleet:read","fleet:write","integrations:read","integrations:manage","communications:read","communications:write","communications:manage","documents:read","documents:write","automation:read","automation:write","agents:read","agents:write","agents:manage","recruiting:read","recruiting:write","intelligence:read","intelligence:write","analytics:read","analytics:write","mobile:read","mobile:write","mobile:manage","orchestration:read","orchestration:write","sales:read","sales:write","marketing:read","marketing:write","leads:read","leads:write","voice:read","voice:write","voice_reception:read","voice_reception:write","voice_reception:manage","document_ai:read","document_ai:write","document_ai:manage","business_continuity:read","business_continuity:write","business_continuity:manage","search:read","search:write","search:manage","data_migration:read","data_migration:write","data_migration:manage","notifications:read","notifications:write","notifications:manage","customer_support:read","customer_support:write","workforce:read","workforce:write","procurement:read","procurement:write","executive:read","executive:write","knowledge:read","knowledge:write","bi:read","bi:write","portal:read","portal:manage","customer_experience:read","customer_experience:write","customer_experience:manage","quality:read","quality:write","communications_intelligence:read","communications_intelligence:write","asset_equipment:read","asset_equipment:write","asset_lifecycle:read","asset_lifecycle:write","asset_lifecycle:manage","workforce_intelligence:read","workforce_intelligence:write","workforce_intelligence:manage","legal_compliance:read","legal_compliance:write","legal_compliance:manage","financial_planning:read","financial_planning:write","financial_planning:manage","sales_intelligence:read","sales_intelligence:write","sales_intelligence:manage","marketing_intelligence:read","marketing_intelligence:write","marketing_intelligence:manage","service_delivery:read","service_delivery:write","service_delivery:manage","it_operations:read","it_operations:write","it_operations:manage","business_evolution:read","business_evolution:write","business_evolution:manage","app_builder:read","app_builder:write","app_builder:manage","industry_packs:read","industry_packs:write","industry_packs:manage","ai_orchestration:read","ai_orchestration:write","dispatch_intelligence:read","dispatch_intelligence:write","fleet_intelligence:read","fleet_intelligence:write","personal_communications:read","personal_communications:write","security:read","security:write","ops:read"]'::jsonb),
    ('Dispatcher', '["customers:read","customers:write","jobs:read","jobs:write","dispatch:read","dispatch:write","leads:read","leads:write","finance:read","communications:read","communications:write","documents:read","documents:write","portal:read","portal:manage","mobile:read","inventory:read","fleet:read","users:read","dispatch_intelligence:read","fleet_intelligence:read"]'::jsonb),
    ('Accountant', '["customers:read","finance:read","finance:write","documents:read","documents:write","integrations:read","integrations:manage","analytics:read","bi:read","financial_planning:read","financial_planning:write","financial_planning:manage","portal:read","notifications:read"]'::jsonb),
    ('Technician', '["mobile:read","mobile:write","jobs:read","jobs:write","documents:read","documents:write","communications:read","communications:write","inventory:read"]'::jsonb),
    ('Member', '["notifications:read","documents:read","communications:read","knowledge:read","search:read","portal:read"]'::jsonb)
) AS v(name, permissions)
WHERE r.name = v.name
  AND r.is_system = true
  AND r.permissions IS DISTINCT FROM v.permissions;

-- Keep legacy Owner/Admin role rows for historical invite references (closed to new assigns)
UPDATE roles
SET
  permissions = '["*"]'::jsonb,
  is_system = true,
  updated_at = now()
WHERE name = 'Owner'
  AND is_system = true
  AND permissions IS DISTINCT FROM '["*"]'::jsonb;

UPDATE roles
SET
  is_system = true,
  updated_at = now()
WHERE name = 'Admin'
  AND is_system = true;

-- ---------------------------------------------------------------------------
-- 2) Remap users (idempotent) + audit each change
-- ---------------------------------------------------------------------------

-- 2a) Owner → Platform Owner (platform_owner tenant only)
WITH moved AS (
  UPDATE users AS u
  SET
    role_id = po.id,
    updated_at = now()
  FROM roles AS owner_role
  INNER JOIN saas_tenant_profiles AS p
    ON p.company_id = owner_role.company_id
   AND p.tenant_kind = 'platform_owner'
  INNER JOIN roles AS po
    ON po.company_id = owner_role.company_id
   AND po.name = 'Platform Owner'
  WHERE u.role_id = owner_role.id
    AND owner_role.name = 'Owner'
    AND u.company_id = owner_role.company_id
  RETURNING u.id AS user_id, u.company_id, owner_role.id AS from_role_id, po.id AS to_role_id
)
INSERT INTO security_audit_logs (
  id, company_id, category, action, entity_type, entity_id, user_id, metadata, occurred_at
)
SELECT
  gen_random_uuid(),
  m.company_id,
  'authorization',
  'role_migration_batch1a',
  'user',
  m.user_id::text,
  m.user_id,
  jsonb_build_object(
    'fromRoleName', 'Owner',
    'toRoleName', 'Platform Owner',
    'fromRoleId', m.from_role_id,
    'toRoleId', m.to_role_id,
    'authority', 'tenant_kind=platform_owner',
    'migration', '0094_canonical_role_matrix',
    'actor', 'migration:0094'
  ),
  now()
FROM moved m
WHERE NOT EXISTS (
  SELECT 1 FROM security_audit_logs s
  WHERE s.company_id = m.company_id
    AND s.action = 'role_migration_batch1a'
    AND s.entity_id = m.user_id::text
    AND s.metadata->>'toRoleName' = 'Platform Owner'
    AND s.metadata->>'migration' = '0094_canonical_role_matrix'
);

-- 2b) Owner → Company Owner (customer / missing saas profile)
WITH moved AS (
  UPDATE users AS u
  SET
    role_id = co.id,
    updated_at = now()
  FROM roles AS owner_role
  INNER JOIN roles AS co
    ON co.company_id = owner_role.company_id
   AND co.name = 'Company Owner'
  LEFT JOIN saas_tenant_profiles AS p
    ON p.company_id = owner_role.company_id
  WHERE u.role_id = owner_role.id
    AND owner_role.name = 'Owner'
    AND u.company_id = owner_role.company_id
    AND (p.id IS NULL OR p.tenant_kind = 'customer')
  RETURNING u.id AS user_id, u.company_id, owner_role.id AS from_role_id, co.id AS to_role_id
)
INSERT INTO security_audit_logs (
  id, company_id, category, action, entity_type, entity_id, user_id, metadata, occurred_at
)
SELECT
  gen_random_uuid(),
  m.company_id,
  'authorization',
  'role_migration_batch1a',
  'user',
  m.user_id::text,
  m.user_id,
  jsonb_build_object(
    'fromRoleName', 'Owner',
    'toRoleName', 'Company Owner',
    'fromRoleId', m.from_role_id,
    'toRoleId', m.to_role_id,
    'authority', 'tenant_kind=customer_or_absent',
    'migration', '0094_canonical_role_matrix',
    'actor', 'migration:0094'
  ),
  now()
FROM moved m
WHERE NOT EXISTS (
  SELECT 1 FROM security_audit_logs s
  WHERE s.company_id = m.company_id
    AND s.action = 'role_migration_batch1a'
    AND s.entity_id = m.user_id::text
    AND s.metadata->>'toRoleName' = 'Company Owner'
    AND s.metadata->>'migration' = '0094_canonical_role_matrix'
);

-- 2c) Admin → Manager
WITH moved AS (
  UPDATE users AS u
  SET
    role_id = mgr.id,
    updated_at = now()
  FROM roles AS admin_role
  INNER JOIN roles AS mgr
    ON mgr.company_id = admin_role.company_id
   AND mgr.name = 'Manager'
  WHERE u.role_id = admin_role.id
    AND admin_role.name = 'Admin'
    AND u.company_id = admin_role.company_id
  RETURNING u.id AS user_id, u.company_id, admin_role.id AS from_role_id, mgr.id AS to_role_id
)
INSERT INTO security_audit_logs (
  id, company_id, category, action, entity_type, entity_id, user_id, metadata, occurred_at
)
SELECT
  gen_random_uuid(),
  m.company_id,
  'authorization',
  'role_migration_batch1a',
  'user',
  m.user_id::text,
  m.user_id,
  jsonb_build_object(
    'fromRoleName', 'Admin',
    'toRoleName', 'Manager',
    'fromRoleId', m.from_role_id,
    'toRoleId', m.to_role_id,
    'authority', 'binding_admin_to_manager',
    'migration', '0094_canonical_role_matrix',
    'actor', 'migration:0094'
  ),
  now()
FROM moved m
WHERE NOT EXISTS (
  SELECT 1 FROM security_audit_logs s
  WHERE s.company_id = m.company_id
    AND s.action = 'role_migration_batch1a'
    AND s.entity_id = m.user_id::text
    AND s.metadata->>'toRoleName' = 'Manager'
    AND s.metadata->>'fromRoleName' = 'Admin'
    AND s.metadata->>'migration' = '0094_canonical_role_matrix'
);

-- 2d) Member retained — audit permission tighten only (no role_id change)
INSERT INTO security_audit_logs (
  id, company_id, category, action, entity_type, entity_id, user_id, metadata, occurred_at
)
SELECT
  gen_random_uuid(),
  u.company_id,
  'authorization',
  'role_migration_batch1a_member_retained',
  'user',
  u.id::text,
  u.id,
  jsonb_build_object(
    'fromRoleName', 'Member',
    'toRoleName', 'Member',
    'roleId', r.id,
    'note', 'Retained as restricted Legacy Member until manual reassignment',
    'migration', '0094_canonical_role_matrix',
    'actor', 'migration:0094'
  ),
  now()
FROM users u
INNER JOIN roles r ON r.id = u.role_id
WHERE r.name = 'Member'
  AND NOT EXISTS (
    SELECT 1 FROM security_audit_logs s
    WHERE s.company_id = u.company_id
      AND s.action = 'role_migration_batch1a_member_retained'
      AND s.entity_id = u.id::text
      AND s.metadata->>'migration' = '0094_canonical_role_matrix'
  );
