/**
 * Disposable-DB verification for 0103_marketing_eligibility_consent.sql
 *
 * Safety:
 * - Creates a throwaway database, never mutates the admin DB name
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Drops disposable DB in finally
 *
 * Usage:
 *   node --env-file=apps/api/.env.staging.local packages/db/scripts/test-0103-marketing-eligibility.mjs
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mig0103 = path.join(__dirname, '../drizzle/0103_marketing_eligibility_consent.sql');
const outPath = path.resolve(
  __dirname,
  '../../../diagnostic-output/94-migration-0103-marketing-eligibility-disposable.json',
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

const TEST_DB = `titan_ux_h_mig_${Date.now().toString(36)}`;
const url = new URL(baseUrl);
const liveDbName = url.pathname.replace(/^\//, '').split('?')[0];
if (
  liveDbName.startsWith('titan_ux_h_mig_') ||
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

// Minimal pre-0103 schema: only tables/columns 0103 ALTERs/CREATEs depend on.
// customers as it existed BEFORE 0103 — no contact_person / is_supplier_only / do_not_contact.
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

-- Pre-0103: no contact_person / is_supplier_only / do_not_contact
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
`;

const report = {
  migration: '0103_marketing_eligibility_consent',
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
  const migrationSql = fs.readFileSync(mig0103, 'utf8');
  await sql.unsafe(migrationSql);

  // --- customers ALTER columns ---
  const customerCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name IN ('contact_person', 'is_supplier_only', 'do_not_contact')
    ORDER BY column_name
  `;
  const customerColNames = customerCols.map((r) => r.column_name);
  const expectedCustomerCols = ['contact_person', 'do_not_contact', 'is_supplier_only'];
  if (expectedCustomerCols.every((c) => customerColNames.includes(c))) {
    pass('customers_new_columns', customerColNames.join(','));
  } else {
    fail('customers_new_columns', JSON.stringify(customerColNames));
  }

  // --- new tables present ---
  const expectedTables = [
    'customer_buyer_classifications',
    'customer_contact_fields',
    'customer_contact_corrections',
    'customer_marketing_consents',
    'customer_marketing_consent_audits',
    'marketing_reactivation_eligibility',
    'marketing_audience_requests',
    'xero_contact_sync_back_requests',
  ];
  const tableRows = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY(${expectedTables})
  `;
  const tableNames = tableRows.map((r) => r.table_name);
  if (expectedTables.every((t) => tableNames.includes(t))) {
    pass('new_tables_present', tableNames.join(','));
  } else {
    fail('new_tables_present', `found ${JSON.stringify(tableNames)}`);
  }

  // --- enums present ---
  const expectedEnums = [
    'buyer_classification',
    'contact_field_key',
    'contact_verification_state',
    'marketing_consent_channel',
    'marketing_consent_status',
    'reactivation_eligibility_status',
    'marketing_audience_request_status',
    'xero_sync_back_request_status',
  ];
  const enums = await sql`
    SELECT typname FROM pg_type WHERE typname = ANY(${expectedEnums})
  `;
  const enumNames = enums.map((r) => r.typname);
  if (expectedEnums.every((e) => enumNames.includes(e))) {
    pass('enums_present', enumNames.join(','));
  } else {
    fail('enums_present', JSON.stringify(enumNames));
  }

  // --- unique indexes present ---
  const expectedIndexes = [
    'customer_buyer_classifications_company_customer_uidx',
    'customer_buyer_classifications_company_client_action_uidx',
    'customer_contact_fields_company_customer_field_uidx',
    'customer_marketing_consents_company_customer_channel_uidx',
    'marketing_reactivation_eligibility_company_customer_uidx',
    'marketing_audience_requests_company_client_action_uidx',
    'xero_contact_sync_back_requests_company_client_action_uidx',
  ];
  const uniqueIndexes = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = ANY(${expectedIndexes})
    ORDER BY indexname
  `;
  const indexNames = uniqueIndexes.map((r) => r.indexname);
  if (expectedIndexes.every((name) => indexNames.includes(name))) {
    pass('unique_indexes_present', indexNames.join(','));
  } else {
    fail('unique_indexes_present', `found ${JSON.stringify(indexNames)}`);
  }

  // Re-apply should be idempotent
  await sql.unsafe(migrationSql);
  pass('0103_reapply_idempotent');

  // --- Sanity round-trip inserts ---
  const [company] = await sql`INSERT INTO companies (name, slug) VALUES ('UX-H Co', 'ux-h-co') RETURNING id`;
  const [user] = await sql`
    INSERT INTO users (company_id, email) VALUES (${company.id}, 'owner@ux-h.test') RETURNING id
  `;
  const [customer] = await sql`
    INSERT INTO customers (company_id, name, email) VALUES (${company.id}, 'UX-H Customer', 'owner@ux-h.test') RETURNING id
  `;

  // customers defaults for new columns
  const [customerDefaults] = await sql`
    SELECT contact_person, is_supplier_only, do_not_contact FROM customers WHERE id = ${customer.id}
  `;
  if (
    customerDefaults.contact_person === null &&
    customerDefaults.is_supplier_only === false &&
    customerDefaults.do_not_contact === false
  ) {
    pass('customers_new_column_defaults_honest');
  } else {
    fail('customers_new_column_defaults_honest', JSON.stringify(customerDefaults));
  }

  // customer_buyer_classifications insert + client_action_id uniqueness
  const classificationActionId = 'ux-h-classification-action-1';
  const [classification] = await sql`
    INSERT INTO customer_buyer_classifications (company_id, customer_id, primary_classification, client_action_id)
    VALUES (${company.id}, ${customer.id}, 'contact_record', ${classificationActionId})
    RETURNING id, primary_classification, is_paid_buyer, client_action_id
  `;
  if (classification.is_paid_buyer === false && classification.primary_classification === 'contact_record') {
    pass('classification_insert_honest_defaults', JSON.stringify(classification));
  } else {
    fail('classification_insert_honest_defaults', JSON.stringify(classification));
  }

  try {
    await sql`
      INSERT INTO customer_buyer_classifications (company_id, customer_id, client_action_id)
      VALUES (${company.id}, ${customer.id}, ${classificationActionId})
    `;
    fail('classification_duplicate_client_action_id_rejected', 'duplicate succeeded');
  } catch {
    pass('classification_duplicate_client_action_id_rejected');
  }

  // Re-computing for the SAME customer (company,customer) unique index — upsert semantics belong to
  // the service layer; here we verify the DB-level unique constraint that makes that upsert safe.
  try {
    await sql`
      INSERT INTO customer_buyer_classifications (company_id, customer_id, primary_classification)
      VALUES (${company.id}, ${customer.id}, 'paid_buyer')
    `;
    fail('classification_duplicate_company_customer_rejected', 'duplicate (company,customer) succeeded');
  } catch {
    pass('classification_duplicate_company_customer_rejected');
  }

  // customer_contact_fields insert + (company,customer,field_key) uniqueness
  const [contactField] = await sql`
    INSERT INTO customer_contact_fields (company_id, customer_id, field_key, value, verification_state, is_shared_company_email)
    VALUES (${company.id}, ${customer.id}, 'email', 'owner@ux-h.test', 'placeholder', true)
    RETURNING id, verification_state, is_shared_company_email
  `;
  if (contactField.verification_state === 'placeholder' && contactField.is_shared_company_email === true) {
    pass('contact_field_placeholder_email_flagged', JSON.stringify(contactField));
  } else {
    fail('contact_field_placeholder_email_flagged', JSON.stringify(contactField));
  }

  try {
    await sql`
      INSERT INTO customer_contact_fields (company_id, customer_id, field_key, value)
      VALUES (${company.id}, ${customer.id}, 'email', 'duplicate@ux-h.test')
    `;
    fail('contact_field_duplicate_company_customer_field_rejected', 'duplicate succeeded');
  } catch {
    pass('contact_field_duplicate_company_customer_field_rejected');
  }

  // customer_contact_corrections history row
  const [correction] = await sql`
    INSERT INTO customer_contact_corrections (company_id, customer_id, field_key, old_value, new_value, reason, changed_by_user_id)
    VALUES (${company.id}, ${customer.id}, 'phone', NULL, '+27821234567', 'Staff verified with customer', ${user.id})
    RETURNING id, reason
  `;
  if (correction.reason === 'Staff verified with customer') {
    pass('contact_correction_history_recorded');
  } else {
    fail('contact_correction_history_recorded', JSON.stringify(correction));
  }

  // customer_marketing_consents default status is 'unknown' — missing/unknown is NOT consent
  const [consent] = await sql`
    INSERT INTO customer_marketing_consents (company_id, customer_id, channel)
    VALUES (${company.id}, ${customer.id}, 'email')
    RETURNING id, status
  `;
  if (consent.status === 'unknown') {
    pass('consent_default_status_unknown_not_granted', consent.status);
  } else {
    fail('consent_default_status_unknown_not_granted', JSON.stringify(consent));
  }

  try {
    await sql`
      INSERT INTO customer_marketing_consents (company_id, customer_id, channel)
      VALUES (${company.id}, ${customer.id}, 'email')
    `;
    fail('consent_duplicate_company_customer_channel_rejected', 'duplicate succeeded');
  } catch {
    pass('consent_duplicate_company_customer_channel_rejected');
  }

  // customer_marketing_consent_audits
  const [consentAudit] = await sql`
    INSERT INTO customer_marketing_consent_audits (company_id, customer_id, channel, previous_status, new_status, reason, changed_by_user_id)
    VALUES (${company.id}, ${customer.id}, 'email', 'unknown', 'granted', 'Customer opted in via call', ${user.id})
    RETURNING id, previous_status, new_status
  `;
  if (consentAudit.previous_status === 'unknown' && consentAudit.new_status === 'granted') {
    pass('consent_audit_recorded');
  } else {
    fail('consent_audit_recorded', JSON.stringify(consentAudit));
  }

  // marketing_reactivation_eligibility default status is 'excluded' (not eligible by default)
  const [eligibility] = await sql`
    INSERT INTO marketing_reactivation_eligibility (company_id, customer_id)
    VALUES (${company.id}, ${customer.id})
    RETURNING id, eligibility_status
  `;
  if (eligibility.eligibility_status === 'excluded') {
    pass('eligibility_default_status_excluded', eligibility.eligibility_status);
  } else {
    fail('eligibility_default_status_excluded', JSON.stringify(eligibility));
  }

  try {
    await sql`
      INSERT INTO marketing_reactivation_eligibility (company_id, customer_id)
      VALUES (${company.id}, ${customer.id})
    `;
    fail('eligibility_duplicate_company_customer_rejected', 'duplicate succeeded');
  } catch {
    pass('eligibility_duplicate_company_customer_rejected');
  }

  // marketing_audience_requests: deliveryState always defaults to not_sent, status defaults to draft
  const audienceActionId = 'ux-h-audience-action-1';
  const [audienceRequest] = await sql`
    INSERT INTO marketing_audience_requests (company_id, name, requested_by_user_id, client_action_id)
    VALUES (${company.id}, 'UX-H reactivation audience', ${user.id}, ${audienceActionId})
    RETURNING id, status, delivery_state
  `;
  if (audienceRequest.status === 'draft' && audienceRequest.delivery_state === 'not_sent') {
    pass('audience_request_defaults_honest', JSON.stringify(audienceRequest));
  } else {
    fail('audience_request_defaults_honest', JSON.stringify(audienceRequest));
  }

  try {
    await sql`
      INSERT INTO marketing_audience_requests (company_id, name, client_action_id)
      VALUES (${company.id}, 'Duplicate audience', ${audienceActionId})
    `;
    fail('audience_request_duplicate_client_action_id_rejected', 'duplicate succeeded');
  } catch {
    pass('audience_request_duplicate_client_action_id_rejected');
  }

  // xero_contact_sync_back_requests: status defaults to requested, never marks providerCalled (no such column — honesty is behavioral, enforced at service layer)
  const syncBackActionId = 'ux-h-syncback-action-1';
  const [syncBackRequest] = await sql`
    INSERT INTO xero_contact_sync_back_requests (company_id, customer_id, requested_fields, requested_by_user_id, client_action_id)
    VALUES (${company.id}, ${customer.id}, '["email","phone"]'::jsonb, ${user.id}, ${syncBackActionId})
    RETURNING id, status
  `;
  if (syncBackRequest.status === 'requested') {
    pass('xero_sync_back_request_default_status', syncBackRequest.status);
  } else {
    fail('xero_sync_back_request_default_status', JSON.stringify(syncBackRequest));
  }

  try {
    await sql`
      INSERT INTO xero_contact_sync_back_requests (company_id, customer_id, client_action_id)
      VALUES (${company.id}, ${customer.id}, ${syncBackActionId})
    `;
    fail('xero_sync_back_duplicate_client_action_id_rejected', 'duplicate succeeded');
  } catch {
    pass('xero_sync_back_duplicate_client_action_id_rejected');
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
