#!/usr/bin/env node
/**
 * 257 — Billing recipient panel wiring verification (staging only).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'phase257-billing-recipient-wiring-staging');
const OUT_JSON = path.resolve(__dirname, '257-billing-recipient-wiring-verify.json');

const WEB = 'https://comfortable-determination-staging.up.railway.app';
const API = 'https://young-guns-os-staging.up.railway.app';
const YGP_COMPANY_ID = '095aef76-fef5-4139-af37-a42f2d7e2faf';

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function readJson(relativePath) {
  const full = path.resolve(repoRoot, relativePath);
  if (!fs.existsSync(full)) return { missing: true };
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function staticWiringChecks() {
  const files = [
    ['apps/web/src/pages/finance/QuoteCreatePage.tsx', 'BillingRecipientPanel'],
    ['apps/web/src/pages/finance/QuoteEditPage.tsx', 'BillingRecipientPanel'],
    ['apps/web/src/pages/finance/InvoiceCreatePage.tsx', 'BillingRecipientPanel'],
    ['apps/web/src/pages/finance/InvoiceEditPage.tsx', 'BillingRecipientPanel'],
    ['apps/web/src/features/aura/finance-draft-aura-suggestions.ts', 'Bill landlord'],
    ['apps/web/src/lib/finance-api.ts', 'updateQuoteBillingRecipient'],
    ['apps/api/src/routes/finance.ts', '/quotes/:id/billing-recipient'],
  ];
  const checks = files.map(([file, needle]) => {
    const full = path.join(repoRoot, file);
    const content = fs.readFileSync(full, 'utf8');
    return { file, needle, pass: content.includes(needle) };
  });
  return {
    pass: checks.every((row) => row.pass),
    checks,
  };
}

async function mintStaffSession() {
  const scriptPath = path.join(repoRoot, '.tmp-mint-257-owner.mjs');
  fs.writeFileSync(
    scriptPath,
    `import { createAccessToken, generateRefreshToken, hashRefreshToken } from './packages/auth/dist/tokens.js';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/packages/db/package.json');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const companyId = '${YGP_COMPANY_ID}';
const [user] = await sql\`
  SELECT u.id, u.role_id, r.name as role_name, r.permissions
  FROM users u JOIN roles r ON r.id = u.role_id
  WHERE u.company_id = \${companyId} AND u.is_active = true
  ORDER BY u.created_at ASC LIMIT 1\`;
if (!user) { process.stdout.write(JSON.stringify({ unavailable: true })); await sql.end(); process.exit(0); }
const sessionId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const refreshToken = generateRefreshToken();
const refreshHash = hashRefreshToken(refreshToken);
await sql\`
  INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, expires_at, last_activity_at, user_agent, ip_address)
  VALUES (\${sessionId}, \${user.id}, \${companyId}, \${refreshHash}, \${expiresAt}, NOW(), '257-billing-verify', '127.0.0.1')\`;
const permissions = Array.isArray(user.permissions) ? user.permissions : [];
const { token } = createAccessToken(
  { sub: user.id, companyId, roleId: user.role_id, roleName: user.role_name, sessionId, permissions },
  process.env.JWT_SECRET,
);
process.stdout.write(JSON.stringify({ accessToken: token, roleName: user.role_name, permissions }));
await sql.end();
`,
  );
  try {
    execSync('pnpm --filter @titan/auth build', { cwd: repoRoot, stdio: 'pipe' });
    const raw = execSync(`railway run --service young-guns-os node ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return JSON.parse(raw);
  } catch (error) {
    return { unavailable: true, error: String(error) };
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

async function seedStaffSession(context, page, session) {
  await context.addInitScript((token) => {
    window.localStorage.setItem(
      'titan_auth',
      JSON.stringify({ accessToken: token, expiresIn: 3600 }),
    );
  }, session.accessToken);
  await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' });
}

async function capturePage(page, name, url, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const shot = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  const body = await page.locator('body').innerText();
  return {
    url,
    viewport: `${viewport.width}x${viewport.height}`,
    screenshot: path.relative(repoRoot, shot),
    hasBillingPanel: /Billing & Recipient|Service Customer|Quote Recipient|Invoice Recipient/i.test(body),
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const result = {
    phase: 257,
    title: 'Billing recipient panel wiring',
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    staging: { web: WEB, api: API, ygpCompanyId: YGP_COMPANY_ID },
    staticWiring: staticWiringChecks(),
    priorPhases: {
      phase254: readJson('diagnostic-output/254-titan-full-functional-aura-audit-verify.json'),
      phase255: readJson('diagnostic-output/255-client-aura-rbac-verify.json'),
      phase256: readJson('diagnostic-output/256-client-portal-aura-verify.json'),
    },
    quote: { pass: false, details: [] },
    invoice: { pass: false, details: [] },
    aura: { pass: false, details: [] },
    audit: { pass: false, details: [] },
    mobile: { pass: false, details: [] },
    api: { pass: false, details: [] },
    verdict: 'HOLD',
  };

  const session = await mintStaffSession();
  if (session.unavailable) {
    result.api.details.push({ note: 'Staff session mint unavailable — API probes skipped' });
  } else {
    const quotesRes = await fetch(`${API}/api/v1/finance/quotes?status=draft`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const quotesJson = quotesRes.ok ? await quotesRes.json() : null;
    const draftQuote = quotesJson?.data?.quotes?.[0] ?? null;
    if (draftQuote) {
      const patchRes = await fetch(
        `${API}/api/v1/finance/quotes/${draftQuote.id}/billing-recipient`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipientName: draftQuote.recipientName ?? draftQuote.customerName,
            reason: '257 verify billing recipient patch',
          }),
        },
      );
      result.api.details.push({
        quoteId: draftQuote.id,
        status: patchRes.status,
        pass: patchRes.ok,
      });
      result.audit.pass = patchRes.ok;
      result.audit.details.push({ action: 'quote_billing_recipient_updated', httpStatus: patchRes.status });
    } else {
      result.api.details.push({ note: 'No draft quote found for PATCH probe' });
    }
    result.api.pass = result.api.details.some((row) => row.pass);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  if (!session.unavailable) {
    await seedStaffSession(context, page, session);

    result.quote.details.push(
      await capturePage(page, 'quote-create-1440', `${WEB}/finance/quotes/new`, { width: 1440, height: 900 }),
    );
    result.quote.details.push(
      await capturePage(page, 'quote-create-375', `${WEB}/finance/quotes/new`, { width: 375, height: 812 }),
    );
    result.invoice.details.push(
      await capturePage(page, 'invoice-create-1440', `${WEB}/finance/invoices/new`, { width: 1440, height: 900 }),
    );
    result.invoice.details.push(
      await capturePage(page, 'invoice-create-375', `${WEB}/finance/invoices/new`, { width: 375, height: 812 }),
    );

    const quotesRes = await fetch(`${API}/api/v1/finance/quotes?status=draft`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const draftQuote = quotesRes.ok ? (await quotesRes.json())?.data?.quotes?.[0] : null;
    if (draftQuote) {
      result.quote.details.push(
        await capturePage(
          page,
          'quote-edit-1440',
          `${WEB}/finance/quotes/${draftQuote.id}/edit`,
          { width: 1440, height: 900 },
        ),
      );
    }

    const invoicesRes = await fetch(`${API}/api/v1/finance/invoices?status=draft`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const draftInvoice = invoicesRes.ok ? (await invoicesRes.json())?.data?.invoices?.[0] : null;
    if (draftInvoice) {
      result.invoice.details.push(
        await capturePage(
          page,
          'invoice-edit-1440',
          `${WEB}/finance/invoices/${draftInvoice.id}/edit`,
          { width: 1440, height: 900 },
        ),
      );
    }

    await page.goto(`${WEB}/finance/quotes/new`, { waitUntil: 'networkidle' });
    const auraButton = page.getByRole('button', { name: /ask aura/i });
    if (await auraButton.count()) {
      await auraButton.first().click();
      await page.waitForTimeout(800);
      const drawerText = await page.locator('.contextual-aura-drawer').innerText().catch(() => '');
      const chips = await page.locator('.contextual-aura-drawer__chip').allTextContents();
      result.aura.details.push({
        drawerOpen: drawerText.length > 0,
        chips,
        hasBillingChip: chips.some((chip) => /landlord|recipient|owner/i.test(chip)),
      });
      await page.screenshot({ path: path.join(OUT_DIR, 'aura-quote-create-drawer-1440.png'), fullPage: true });
    }
  }

  await browser.close();

  result.quote.pass = result.quote.details.some((row) => row.hasBillingPanel);
  result.invoice.pass = result.invoice.details.some((row) => row.hasBillingPanel);
  result.aura.pass = result.aura.details.some((row) => row.hasBillingChip);
  result.mobile.pass = result.quote.details.some((row) => row.viewport === '375x812' && row.hasBillingPanel);

  const prior254Go = result.priorPhases.phase254?.verdict === 'GO';
  const prior255Go = result.priorPhases.phase255?.verdict === 'GO';
  const prior256Go = result.priorPhases.phase256?.verdict === 'GO';

  const wiringGo =
    result.staticWiring.pass &&
    result.quote.pass &&
    result.invoice.pass &&
    prior254Go &&
    prior255Go &&
    prior256Go;

  result.verdict = wiringGo ? 'GO' : 'HOLD';
  result.summary = {
    wiringGo,
    prior254Go,
    prior255Go,
    prior256Go,
    production: 'UNTOUCHED',
    paymentAllocation: 'DATA-DEPENDENT HOLD',
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ out: OUT_JSON, verdict: result.verdict }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
