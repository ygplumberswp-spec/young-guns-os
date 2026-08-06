/**
 * Disposable-DB verification for 0107_whatsapp_contact_enrichment.sql
 * Refuses production ref rshuiaghmtrvvilhqpwm.
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migPath = path.join(__dirname, '../drizzle/0107_whatsapp_contact_enrichment.sql');
const outPath = path.resolve(
  __dirname,
  '../../../diagnostic-output/118-migration-0107-whatsapp-enrichment-disposable.json',
);
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}
if (baseUrl.toLowerCase().includes(FORBIDDEN)) {
  console.error('Refusing forbidden production ref');
  process.exit(3);
}

const TEST_DB = `titan_wa_enrich_mig_${Date.now().toString(36)}`;

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

const results = [];

async function main() {
  const admin = adminSql();
  let testDb;
  try {
    await admin.unsafe(`CREATE DATABASE ${TEST_DB}`);
    testDb = testSql();
    const sqlText = fs.readFileSync(migPath, 'utf8');

    // Apply on disposable DB only — requires base schema; apply minimal company/customer stubs if needed
    await testDb.unsafe(`
      CREATE TABLE IF NOT EXISTS companies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        email text NOT NULL,
        password_hash text NOT NULL DEFAULT '',
        role_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS customers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        is_supplier_only boolean NOT NULL DEFAULT false,
        do_not_contact boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await testDb.unsafe(sqlText);

    const tables = await testDb`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('customer_contact_sources', 'whatsapp_match_reviews')
      ORDER BY table_name
    `;
    results.push({
      check: 'tables_present',
      pass: tables.length === 2,
      tables: tables.map((t) => t.table_name),
    });

    const [company] = await testDb`INSERT INTO companies (name) VALUES ('Disposable WA Enrich') RETURNING id`;
    const [customer] = await testDb`
      INSERT INTO customers (company_id, name) VALUES (${company.id}, 'Test Customer') RETURNING id
    `;

    await testDb`
      INSERT INTO customer_contact_sources (company_id, customer_id, normalized_mobile, source)
      VALUES (${company.id}, ${customer.id}, '+27821234567', 'whatsapp_conversation')
    `;

    const [sourceCount] = await testDb`SELECT count(*)::int AS n FROM customer_contact_sources`;
    results.push({ check: 'insert_contact_source', pass: sourceCount.n === 1, count: sourceCount.n });

    await testDb.unsafe(sqlText);
    const [sourceCount2] = await testDb`SELECT count(*)::int AS n FROM customer_contact_sources`;
    results.push({ check: 'reapply_idempotent', pass: sourceCount2.n === 1, count: sourceCount2.n });

    const output = {
      generatedAt: new Date().toISOString(),
      disposableDb: TEST_DB,
      migration: '0107_whatsapp_contact_enrichment.sql',
      results,
      pass: results.every((r) => r.pass),
    };
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output, null, 2));
    if (!output.pass) process.exit(1);
  } finally {
    if (testDb) await testDb.end();
    await admin.unsafe(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await admin.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
