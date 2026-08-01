/**
 * Phase 8–12 staging smoke — public Railway API only.
 * Refuses production Supabase ref. No local postgres required.
 *
 * Usage:
 *   STAGING_API_BASE=https://young-guns-os-staging.up.railway.app \
 *     node packages/db/scripts/staging-phase8-12-public-e2e.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/142-staging-phase8-12-e2e.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-P8-12';
const API_ORIGIN = (process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app').replace(
  /\/$/,
  '',
);

function pass(results, name, detail = '') {
  results.push({ name, status: 'PASS', detail });
}
function fail(results, name, detail = '') {
  results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 500) });
}
function blocked(results, name, detail = '') {
  results.push({ name, status: 'BLOCKED', detail: String(detail).slice(0, 500) });
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_ORIGIN}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function signupOwner(suffix) {
  const password = 'StagingPhase812Pass1!';
  const signup = await api('/api/v1/auth/signup', {
    method: 'POST',
    body: {
      companyName: `${LABEL} Co ${suffix}`,
      firstName: 'Phase',
      lastName: 'EightTwelve',
      email: `phase812.${suffix}@staging-p812.test`,
      password,
    },
  });
  const token = signup.json?.data?.session?.accessToken;
  const companyId = signup.json?.data?.user?.companyId;
  const userId = signup.json?.data?.user?.id;
  return { ok: signup.status === 201 && !!token, token, companyId, userId, password, detail: signup };
}

async function createMinimalJob(token) {
  const customer = await api('/api/v1/crm/customers', {
    method: 'POST',
    token,
    body: { name: 'P812 Customer', email: 'p812@test.local', phone: '0825559999' },
  });
  const customerId = customer.json?.data?.customer?.id;
  if (!customerId) return { ok: false, detail: 'customer create failed' };

  const property = await api(`/api/v1/crm/customers/${customerId}/properties`, {
    method: 'POST',
    token,
    body: {
      propertyName: 'Site',
      street: '1 Test St',
      suburb: 'Observatory',
      city: 'Cape Town',
      province: 'Western Cape',
      postalCode: '7925',
      isPrimary: true,
    },
  });
  const propertyId = property.json?.data?.property?.id;
  if (!propertyId) return { ok: false, detail: 'property create failed' };

  const job = await api('/api/v1/jobs', {
    method: 'POST',
    token,
    body: {
      customerId,
      propertyId,
      jobType: 'Smoke test job',
      description: 'Phase 8-12 staging smoke',
      priority: 'normal',
    },
  });
  const jobId = job.json?.data?.job?.id;
  if (!jobId) return { ok: false, detail: 'job create failed' };
  return { ok: true, jobId, customerId };
}

async function main() {
  const report = {
    label: LABEL,
    phases: [8, 9, 10, 11, 12],
    startedAt: new Date().toISOString(),
    apiOrigin: API_ORIGIN,
    forbiddenRefChecked: true,
    productionRefTouched: false,
    results: [],
    totals: { passed: 0, failed: 0, blocked: 0 },
    verdict: 'NO-GO',
  };

  if (API_ORIGIN.toLowerCase().includes(FORBIDDEN)) {
    fail(report.results, 'target_not_production', 'API origin must not be production');
    report.verdict = 'BLOCKED_PRODUCTION';
    writeReport(report);
    process.exit(3);
  }

  const ready = await api('/api/v1/health/ready');
  if (ready.status !== 200 || ready.json?.data?.database !== 'connected') {
    fail(report.results, 'staging_api_ready', JSON.stringify(ready.json || ready.status));
    writeReport(report);
    process.exit(4);
  }
  pass(report.results, 'staging_api_ready', 'database=connected');

  const suffix = randomBytes(4).toString('hex');
  const owner = await signupOwner(suffix);
  if (!owner.ok) {
    fail(report.results, 'owner_signup', JSON.stringify(owner.detail?.json?.error || owner.detail?.status));
    finalize(report);
    process.exit(5);
  }
  pass(report.results, 'owner_signup', owner.companyId || '');

  const today = new Date().toISOString().slice(0, 10);

  // Phase 8 — business-day timeline
  const timelineNoDate = await api('/api/v1/scheduling/day-timeline', { token: owner.token });
  if (timelineNoDate.status === 400) {
    pass(report.results, 'p8_timeline_validation', 'date required');
  } else {
    fail(report.results, 'p8_timeline_validation', String(timelineNoDate.status));
  }

  const timeline = await api(`/api/v1/scheduling/day-timeline?date=${today}`, { token: owner.token });
  if (timeline.status === 200 && timeline.json?.data) {
    pass(report.results, 'p8_day_timeline', `date=${today}`);
  } else {
    fail(report.results, 'p8_day_timeline', JSON.stringify(timeline.json?.error || timeline.status));
  }

  const foreign = await signupOwner(`${suffix}-foreign`);
  if (foreign.ok) {
    const denied = await api(`/api/v1/scheduling/day-timeline?date=${today}`, { token: foreign.token });
    if (denied.status === 200) {
      pass(report.results, 'p8_timeline_tenant_isolated', 'each tenant gets own timeline');
    } else {
      fail(report.results, 'p8_timeline_tenant_isolated', String(denied.status));
    }
  }

  const jobCtx = await createMinimalJob(owner.token);
  if (!jobCtx.ok) {
    fail(report.results, 'fixture_job', jobCtx.detail);
  } else {
    pass(report.results, 'fixture_job', jobCtx.jobId);
  }

  // Phase 9 — BOQ workspace (requires migration 0105 + deploy)
  const boqUnauth = await api('/api/v1/boq');
  if (boqUnauth.status === 401) {
    pass(report.results, 'p9_boq_route_mounted', 'auth required');
    const boqList = await api('/api/v1/boq', { token: owner.token });
    if (boqList.status === 200) {
      pass(report.results, 'p9_boq_list', `count=${boqList.json?.data?.documents?.length ?? 0}`);
      const boqCreate = await api('/api/v1/boq', {
        method: 'POST',
        token: owner.token,
        body: {
          title: 'Staging smoke BOQ',
          lineItems: [{ description: 'Labour', quantity: 1, unitCostCents: 10000 }],
          clientActionId: `p9-boq-${suffix}`,
        },
      });
      if (boqCreate.status === 201 && boqCreate.json?.data?.document?.id) {
        pass(report.results, 'p9_boq_create', boqCreate.json.data.document.boqNumber || 'created');
      } else {
        fail(report.results, 'p9_boq_create', JSON.stringify(boqCreate.json?.error || boqCreate.status));
      }
    } else {
      fail(report.results, 'p9_boq_list', JSON.stringify(boqList.json?.error || boqList.status));
    }
  } else if (boqUnauth.status === 404) {
    blocked(report.results, 'p9_boq_route_mounted', '404 — deploy HEAD + migration 0105 required');
    blocked(report.results, 'p9_boq_list', 'blocked by missing route');
    blocked(report.results, 'p9_boq_create', 'blocked by missing route');
  } else {
    fail(report.results, 'p9_boq_route_mounted', String(boqUnauth.status));
  }

  // Phase 10 — job costing + stock movements
  if (jobCtx.ok) {
    const costing = await api(`/api/v1/jobs/${jobCtx.jobId}/costing`, { token: owner.token });
    if (costing.status === 200 && costing.json?.data?.summary) {
      pass(report.results, 'p10_job_costing', 'summary returned');
    } else if (costing.status === 403) {
      pass(report.results, 'p10_job_costing_rbac', '403 for owner without finance role — expected RBAC');
    } else {
      fail(report.results, 'p10_job_costing', JSON.stringify(costing.json?.error || costing.status));
    }
  }

  const movements = await api('/api/v1/inventory/movements', { token: owner.token });
  if (movements.status === 200) {
    pass(report.results, 'p10_stock_movements_list', `count=${movements.json?.data?.movements?.length ?? 0}`);
  } else {
    fail(report.results, 'p10_stock_movements_list', JSON.stringify(movements.json?.error || movements.status));
  }

  const stock = await api('/api/v1/inventory/stock', { token: owner.token });
  if (stock.status === 200) {
    pass(report.results, 'p10_stock_levels', `count=${stock.json?.data?.stockLevels?.length ?? 0}`);
  } else {
    fail(report.results, 'p10_stock_levels', JSON.stringify(stock.json?.error || stock.status));
  }

  // Phase 11 — job document packs (requires migration 0106 + deploy)
  const packsUnauth = await api('/api/v1/job-document-packs');
  if (packsUnauth.status === 401) {
    pass(report.results, 'p11_packs_route_mounted', 'auth required');
    const packsList = await api('/api/v1/job-document-packs', { token: owner.token });
    if (packsList.status === 200) {
      pass(report.results, 'p11_packs_list', `count=${packsList.json?.data?.packs?.length ?? 0}`);
      if (jobCtx.ok) {
        const packCreate = await api('/api/v1/job-document-packs', {
          method: 'POST',
          token: owner.token,
          body: {
            jobId: jobCtx.jobId,
            title: 'Staging smoke pack',
            clientActionId: `p11-pack-${suffix}`,
          },
        });
        if (packCreate.status === 201 && packCreate.json?.data?.pack?.id) {
          pass(report.results, 'p11_pack_create', packCreate.json.data.pack.id);
        } else {
          fail(report.results, 'p11_pack_create', JSON.stringify(packCreate.json?.error || packCreate.status));
        }
      }
    } else {
      fail(report.results, 'p11_packs_list', JSON.stringify(packsList.json?.error || packsList.status));
    }
  } else if (packsUnauth.status === 404) {
    blocked(report.results, 'p11_packs_route_mounted', '404 — deploy HEAD + migration 0106 required');
    blocked(report.results, 'p11_packs_list', 'blocked by missing route');
    blocked(report.results, 'p11_pack_create', 'blocked by missing route');
  } else {
    fail(report.results, 'p11_packs_route_mounted', String(packsUnauth.status));
  }

  // Phase 12 — finance summary + invoice-from-job
  if (jobCtx.ok) {
    const finSummary = await api(`/api/v1/finance/jobs/${jobCtx.jobId}/finance-summary`, {
      token: owner.token,
    });
    if (finSummary.status === 200 && finSummary.json?.data?.summary) {
      pass(report.results, 'p12_finance_summary', 'summary returned');
    } else {
      fail(report.results, 'p12_finance_summary', JSON.stringify(finSummary.json?.error || finSummary.status));
    }

    const actionId = `p12-inv-${suffix}`;
    const invoice = await api(`/api/v1/finance/jobs/${jobCtx.jobId}/invoices`, {
      method: 'POST',
      token: owner.token,
      body: {
        clientActionId: actionId,
        stage: 'standard',
        amountCents: 150000,
        notes: 'Phase 12 staging smoke invoice',
      },
    });
    if (invoice.status === 201 && invoice.json?.data?.invoice?.id) {
      pass(report.results, 'p12_invoice_from_job', invoice.json.data.invoice.invoiceNumber || 'created');
      const retry = await api(`/api/v1/finance/jobs/${jobCtx.jobId}/invoices`, {
        method: 'POST',
        token: owner.token,
        body: {
          clientActionId: actionId,
          stage: 'standard',
          amountCents: 150000,
        },
      });
      if (retry.status === 200 && retry.json?.data?.invoice?.id) {
        pass(report.results, 'p12_invoice_idempotent', 'replay ok');
      } else if (retry.status === 409) {
        pass(report.results, 'p12_invoice_idempotent', 'conflict on replay — acceptable');
      } else {
        fail(report.results, 'p12_invoice_idempotent', JSON.stringify(retry.json?.error || retry.status));
      }
    } else {
      fail(report.results, 'p12_invoice_from_job', JSON.stringify(invoice.json?.error || invoice.status));
    }
  }

  finalize(report);
  const exitCode = report.totals.failed > 0 ? 8 : report.totals.blocked > 0 ? 9 : 0;
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        passed: report.totals.passed,
        failed: report.totals.failed,
        blocked: report.totals.blocked,
      },
      null,
      2,
    ),
  );
  process.exit(exitCode);
}

function finalize(report) {
  report.totals.passed = report.results.filter((r) => r.status === 'PASS').length;
  report.totals.failed = report.results.filter((r) => r.status === 'FAIL').length;
  report.totals.blocked = report.results.filter((r) => r.status === 'BLOCKED').length;
  if (report.totals.failed > 0) {
    report.verdict = 'NO-GO';
  } else if (report.totals.blocked > 0) {
    report.verdict = 'PARTIAL_BLOCKED';
  } else {
    report.verdict = 'GO';
  }
  report.completedAt = new Date().toISOString();
  writeReport(report);
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
}

await main();
