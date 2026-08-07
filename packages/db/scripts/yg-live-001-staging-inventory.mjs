#!/usr/bin/env node
/**
 * YG-LIVE-001 — Read-only Young Guns staging inventory.
 *
 * Safe SELECT counts only. Refuses production Supabase ref.
 * Does not mutate data, send messages, sync providers, or create tenants.
 *
 * Usage:
 *   DATABASE_URL=... node packages/db/scripts/yg-live-001-staging-inventory.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const FORBIDDEN_PROD_REF = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const YG_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(resolve(root, 'apps/api/.env.staging.local'));
loadEnvFile(resolve(root, 'apps/api/.env'));

const databaseUrl = process.env.DATABASE_URL || process.env.STAGING_DATABASE_URL || '';
if (!databaseUrl) {
  console.error('BLOCKED — DATABASE_URL / STAGING_DATABASE_URL unavailable for inventory.');
  process.exit(2);
}
if (databaseUrl.includes(FORBIDDEN_PROD_REF)) {
  console.error('REFUSED — production database ref is forbidden for YG-LIVE-001 inventory.');
  process.exit(3);
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });

function maskEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const safeUser = user.length <= 2 ? '*'.repeat(user.length) : `${user.slice(0, 1)}***${user.slice(-1)}`;
  return `${safeUser}@${domain}`;
}

async function count(table) {
  try {
    const rows = await sql.unsafe(
      `select count(*)::int as c from ${table} where company_id = $1`,
      [YG_COMPANY_ID],
    );
    return rows[0]?.c ?? 0;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const companies = await sql`
    select id, name, slug, preferences, created_at
    from companies
    where id = ${YG_COMPANY_ID}
    limit 1
  `;
  if (!companies[0]) {
    console.error('FAIL — canonical Young Guns company not found; refusing to invent a tenant.');
    process.exit(4);
  }

  const company = companies[0];
  const prefs = company.preferences ?? {};

  const users = await sql`
    select u.id, u.email, u.first_name, u.last_name, r.name as role_name, u.is_active
    from users u
    left join roles r on r.id = u.role_id
    where u.company_id = ${YG_COMPANY_ID}
    order by r.name nulls last, u.email
  `;

  const roleCounts = {};
  for (const user of users) {
    const role = user.role_name || 'Unknown';
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  }

  const inventory = {
    label: 'YG-LIVE-001-staging-inventory',
    generatedAt: new Date().toISOString(),
    stagingRefHint: STAGING_REF,
    productionForbiddenRef: FORBIDDEN_PROD_REF,
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      currency: prefs.currency ?? null,
      locale: prefs.locale ?? null,
      timezone: prefs.timezone ?? null,
      vatNumberPresent: Boolean(prefs.vatNumber),
      operatingHoursPresent: Boolean(prefs.operatingHours),
      logoFileIdPresent: Boolean(prefs.logoFileId),
      createdAt: company.created_at,
    },
    users: {
      total: users.length,
      byRole: roleCounts,
      safeDirectory: users.map((u) => ({
        idPrefix: String(u.id).slice(0, 8),
        emailMasked: maskEmail(u.email),
        roleName: u.role_name,
        isActive: u.is_active,
        nameInitials: `${(u.first_name || '?')[0] || '?'}${(u.last_name || '?')[0] || '?'}`,
      })),
    },
    counts: {
      customers: await count('customers'),
      properties: await count('cx_customer_properties'),
      jobs: await count('jobs'),
      quotes: await count('quotes'),
      invoices: await count('invoices'),
      payments: await count('payments'),
      vehicles: await count('vehicles'),
      inventoryItems: await count('inventory_items'),
      suppliers: await count('suppliers'),
      documents: await count('documents'),
      communications: await count('communications'),
      whatsappMessages: await count('whatsapp_messages'),
    },
    safety: {
      productionTouched: 0,
      mutations: 0,
      messagesSent: 0,
    },
  };

  const outDir = resolve(root, 'diagnostic-output');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'yg-live-001-staging-inventory.json');
  writeFileSync(outPath, JSON.stringify(inventory, null, 2) + '\n');
  console.log(JSON.stringify(inventory, null, 2));
  console.log(`Wrote ${outPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
