/**
 * Disposable-DB verification for 0102_comms_honesty.sql
 *
 * Safety:
 * - Creates a throwaway database, never mutates the admin DB name
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Drops disposable DB in finally
 *
 * Usage:
 *   node --env-file=apps/api/.env.staging.local packages/db/scripts/test-0102-comms-honesty.mjs
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mig0102 = path.join(__dirname, '../drizzle/0102_comms_honesty.sql');
const outPath = path.resolve(
  __dirname,
  '../../../diagnostic-output/85-migration-0102-comms-honesty-disposable.json',
);
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('DATABASE_URL required (admin connection to create disposable DB)');
  process.exit(1);
}
if (baseUrl.toLowerCase().includes(FORBIDDEN)) {
  console.error('Refusing to run against forbidden live project ref');
  process.exit(3);
}

const TEST_DB = `titan_ux_g_mig_${Date.now().toString(36)}`;
const url = new URL(baseUrl);
const liveDbName = url.pathname.replace(/^\//, '').split('?')[0];
if (
  liveDbName.startsWith('titan_ux_g_mig_') ||
  liveDbName.startsWith('titan_ux_f_mig_') ||
  liveDbName.startsWith('titan_ux_e_mig_') ||
  liveDbName.startsWith('titan_ux_d_mig_') ||
  liveDbName.startsWith('titan_ux_b_')
) {
  console.error('Refusing to run: DATABASE_URL already points at disposable test DB');
  process.exit(1);
}

function adminSql() {
  const u = new URL(baseUrl);
  u.pathname = '/postgres';
  return postgres(u.toString(), { max: 1, onnotice: () => {} });
}

function testSql() {
  const u = new URL(baseUrl);
  u.pathname = `/${TEST_DB}`;
  return postgres(u.toString(), { max: 1, onnotice: () => {} });
}

// Minimal pre-0102 schema: only tables/columns 0102 ALTERs/CREATEs need.
// communications as it existed BEFORE 0102 — no job_id/visibility/delivery_state/
// client_action_id/failure_reason. portal_customer_requests without client_action_id.
const minimal = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text NOT NULL DEFAULT 'x',
  first_name text NOT NULL DEFAULT 'A',
  last_name text NOT NULL DEFAULT 'B',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  job_number text NOT NULL DEFAULT 'JOB-000001',
  title text NOT NULL DEFAULT 'Job',
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE communication_channel AS ENUM ('email', 'phone', 'sms', 'note');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE communication_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel communication_channel NOT NULL DEFAULT 'note',
  subject text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pre-0102: no job_id / visibility / delivery_state / client_action_id / failure_reason
CREATE TABLE communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES users(id),
  template_id uuid REFERENCES message_templates(id) ON DELETE SET NULL,
  channel communication_channel NOT NULL DEFAULT 'note',
  direction communication_direction NOT NULL DEFAULT 'outbound',
  subject text,
  body text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE portal_customer_request_type AS ENUM (
    'quote_clarification',
    'quote_approval',
    'appointment_reschedule',
    'appointment_cancellation',
    'appointment_confirmation',
    'support_message',
    'general_request'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE portal_customer_request_status AS ENUM (
    'pending_approval',
    'approved',
    'rejected',
    'executed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE portal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text NOT NULL DEFAULT 'x',
  first_name text NOT NULL DEFAULT 'A',
  last_name text NOT NULL DEFAULT 'B',
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pre-0102: no client_action_id
CREATE TABLE portal_customer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  portal_user_id uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  request_type portal_customer_request_type NOT NULL,
  status portal_customer_request_status NOT NULL DEFAULT 'pending_approval',
  subject text NOT NULL,
  message text NOT NULL,
  entity_type text,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

const report = {
  migration: '0102_comms_honesty',
  disposableDb: TEST_DB,
  checks: [],
  ok: false,
};

function pass(name, detail) {
  report.checks.push({ name, ok: true, ...(detail !== undefined ? { detail } : {}) });
  console.log(`PASS ${name}`);
}

function fail(name, detail) {
  report.checks.push({ name, ok: false, detail });
  console.error(`FAIL ${name}: ${detail}`);
}

let admin;
let sql;
try {
  admin = adminSql();
  await admin.unsafe(`CREATE DATABASE "${TEST_DB}"`);
  sql = testSql();
  await sql.unsafe(minimal);
  const migrationSql = fs.readFileSync(mig0102, 'utf8');
  await sql.unsafe(migrationSql);

  const commCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'communications'
      AND column_name IN ('job_id', 'visibility', 'delivery_state', 'client_action_id', 'failure_reason')
    ORDER BY column_name
  `;
  const commColNames = commCols.map((r) => r.column_name);
  const expectedCommCols = ['client_action_id', 'delivery_state', 'failure_reason', 'job_id', 'visibility'];
  if (expectedCommCols.every((c) => commColNames.includes(c))) {
    pass('communications_new_columns', commColNames.join(','));
  } else {
    fail('communications_new_columns', JSON.stringify(commColNames));
  }

  const enums = await sql`
    SELECT typname FROM pg_type
    WHERE typname IN ('communication_visibility', 'communication_delivery_state')
    ORDER BY typname
  `;
  const enumNames = enums.map((r) => r.typname);
  if (
    enumNames.includes('communication_visibility') &&
    enumNames.includes('communication_delivery_state')
  ) {
    pass('honesty_enums_present', enumNames.join(','));
  } else {
    fail('honesty_enums_present', JSON.stringify(enumNames));
  }

  const expectedIndexes = [
    'communications_company_client_action_uidx',
    'portal_customer_requests_company_client_action_uidx',
  ];
  const uniqueIndexes = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY(${expectedIndexes})
    ORDER BY indexname
  `;
  const indexNames = uniqueIndexes.map((r) => r.indexname);
  if (expectedIndexes.every((name) => indexNames.includes(name))) {
    pass('unique_indexes_present', indexNames.join(','));
  } else {
    fail('unique_indexes_present', `found ${JSON.stringify(indexNames)}`);
  }

  const portalCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'portal_customer_requests'
      AND column_name = 'client_action_id'
  `;
  if (portalCols.length === 1) {
    pass('portal_customer_requests_client_action_id_column');
  } else {
    fail('portal_customer_requests_client_action_id_column', 'missing');
  }

  // Re-apply should be idempotent
  await sql.unsafe(migrationSql);
  pass('0102_reapply_idempotent');

  // Sanity round-trip: legacy-shaped insert defaults to honest values
  const [company] = await sql`INSERT INTO companies (name, slug) VALUES ('UX-G Co', 'ux-g-co') RETURNING id`;
  const [user] = await sql`
    INSERT INTO users (company_id, email) VALUES (${company.id}, 'owner@ux-g.test') RETURNING id
  `;
  const [customer] = await sql`
    INSERT INTO customers (company_id, name) VALUES (${company.id}, 'UX-G Customer') RETURNING id
  `;
  const [job] = await sql`
    INSERT INTO jobs (company_id, customer_id, job_number)
    VALUES (${company.id}, ${customer.id}, 'JOB-UXG-1')
    RETURNING id
  `;

  const [legacyRow] = await sql`
    INSERT INTO communications (company_id, customer_id, author_user_id, body)
    VALUES (${company.id}, ${customer.id}, ${user.id}, 'Legacy shaped note')
    RETURNING id, visibility, delivery_state, job_id, client_action_id, failure_reason
  `;
  if (legacyRow.visibility === 'internal_note' && legacyRow.delivery_state === 'logged_only') {
    pass(
      'legacy_shaped_insert_defaults_honest',
      JSON.stringify({ visibility: legacyRow.visibility, deliveryState: legacyRow.delivery_state }),
    );
  } else {
    fail('legacy_shaped_insert_defaults_honest', JSON.stringify(legacyRow));
  }

  const clientActionId = 'ux-g-comm-action-1';
  const [withAction] = await sql`
    INSERT INTO communications (company_id, customer_id, author_user_id, job_id, body, client_action_id)
    VALUES (${company.id}, ${customer.id}, ${user.id}, ${job.id}, 'Job-linked note', ${clientActionId})
    RETURNING id, client_action_id
  `;
  if (withAction.client_action_id === clientActionId) {
    pass('insert_with_client_action_id', withAction.id);
  } else {
    fail('insert_with_client_action_id', JSON.stringify(withAction));
  }

  try {
    await sql`
      INSERT INTO communications (company_id, customer_id, author_user_id, body, client_action_id)
      VALUES (${company.id}, ${customer.id}, ${user.id}, 'Duplicate action', ${clientActionId})
    `;
    fail('duplicate_client_action_id_rejected', 'duplicate client_action_id succeeded');
  } catch {
    pass('duplicate_client_action_id_rejected');
  }

  const [portalUser] = await sql`
    INSERT INTO portal_users (company_id, customer_id, email)
    VALUES (${company.id}, ${customer.id}, 'portal@ux-g.test')
    RETURNING id
  `;
  const portalActionId = 'ux-g-portal-action-1';
  const [portalReq] = await sql`
    INSERT INTO portal_customer_requests (
      company_id, customer_id, portal_user_id, request_type, subject, message, client_action_id
    ) VALUES (
      ${company.id}, ${customer.id}, ${portalUser.id}, 'general_request', 'Subject', 'Message', ${portalActionId}
    ) RETURNING id, client_action_id
  `;
  if (portalReq.client_action_id === portalActionId) {
    pass('portal_request_insert_with_client_action_id', portalReq.id);
  } else {
    fail('portal_request_insert_with_client_action_id', JSON.stringify(portalReq));
  }

  try {
    await sql`
      INSERT INTO portal_customer_requests (
        company_id, customer_id, portal_user_id, request_type, subject, message, client_action_id
      ) VALUES (
        ${company.id}, ${customer.id}, ${portalUser.id}, 'general_request', 'Subject dup', 'Message dup', ${portalActionId}
      )
    `;
    fail('portal_request_duplicate_client_action_id_rejected', 'duplicate client_action_id succeeded');
  } catch {
    pass('portal_request_duplicate_client_action_id_rejected');
  }

  report.ok = report.checks.every((c) => c.ok);
} catch (error) {
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
  console.error(report.error);
} finally {
  if (sql) await sql.end({ timeout: 5 });
  if (admin) {
    try {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
      pass('disposable_db_dropped');
    } catch (error) {
      fail('disposable_db_dropped', error instanceof Error ? error.message : String(error));
    }
    await admin.end({ timeout: 5 });
  }
  report.ok = report.checks.every((c) => c.ok) && !report.error;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, outPath, disposableDb: TEST_DB }, null, 2));
  process.exit(report.ok ? 0 : 1);
}
