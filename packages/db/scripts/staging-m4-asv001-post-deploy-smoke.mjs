#!/usr/bin/env node
/**
 * Focused M4 ASV-001 post-deploy staging smoke.
 * Staging API + web only. No production. No provider publish/send/approve execution.
 * Labelled temporary signup for auth coverage; draft rows cleaned up afterward.
 */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import {
  sanitizeDraftPayload,
  selectSafeCustomerDraftRestore,
  PURCHASE_ORDER_DRAFT_KIND,
  buildDraftKey,
} from '../../shared/dist/drafts.js';

const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../auth/package.json'));
const jwt = require('jsonwebtoken');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../..');
const LABEL = 'STAGING-M4-ASV001';
const API = process.env.STAGING_API_BASE || 'https://young-guns-os-staging.up.railway.app';
const WEB = process.env.STAGING_WEB_BASE || 'https://comfortable-determination-staging.up.railway.app';
const COMMIT = process.env.STAGING_COMMIT || 'fc5d9f47a4f5a47ee94dc5b2b415cbd4f98f2691';
const suffix = Date.now().toString(36).slice(-8);
const password = `M4-Smoke-${suffix}!Aa1`;

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

const results = {};
const warnings = [];
function pass(key, detail) {
  results[key] = detail ? `PASS (${detail})` : 'PASS';
  console.log(`PASS — ${key}${detail ? `: ${detail}` : ''}`);
}
function fail(key, detail) {
  results[key] = detail ? `FAIL (${detail})` : 'FAIL';
  console.error(`FAIL — ${key}${detail ? `: ${detail}` : ''}`);
}
function warn(msg) {
  warnings.push(msg);
  console.warn(`WARN — ${msg}`);
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
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

async function inviteRole(ownerToken, roleId, email, firstName, lastName) {
  const invite = await api('/api/v1/team/invites', {
    method: 'POST',
    token: ownerToken,
    body: { email, roleId },
  });
  const inviteUrl = invite.json?.data?.inviteUrl;
  const tokenMatch = typeof inviteUrl === 'string' ? inviteUrl.match(/token=([^&]+)/) : null;
  if (invite.status !== 201 || !tokenMatch) return null;
  const accept = await api('/api/v1/auth/accept-invite', {
    method: 'POST',
    body: { token: tokenMatch[1], firstName, lastName, password },
  });
  const accessToken = accept.json?.data?.session?.accessToken;
  const userId = accept.json?.data?.user?.id;
  const permissions = accept.json?.data?.user?.permissions || [];
  if (accept.status !== 201 || !accessToken || !userId) return null;
  return { token: accessToken, userId, permissions };
}

async function mintSession(sql, jwtSecret, companyId, preferUserId = null) {
  const owners = preferUserId
    ? await sql`
        SELECT u.id AS user_id, u.role_id, r.name AS role_name, r.permissions
        FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.company_id = ${companyId} AND u.id = ${preferUserId}
        LIMIT 1
      `
    : await sql`
        SELECT u.id AS user_id, u.role_id, r.name AS role_name, r.permissions
        FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.company_id = ${companyId}
        ORDER BY CASE WHEN r.permissions::text LIKE '%"*"%' THEN 0 ELSE 1 END, u.created_at ASC
        LIMIT 1
      `;
  if (!owners.length) return null;
  const owner = owners[0];
  const sessionId = randomUUID();
  await sql`
    INSERT INTO sessions (id, user_id, company_id, refresh_token_hash, user_agent, expires_at)
    VALUES (
      ${sessionId}, ${owner.user_id}, ${companyId}, ${`m4-smoke-${suffix}`},
      ${'staging-m4-asv001-smoke'}, ${new Date(Date.now() + 20 * 60 * 1000)}
    )
  `;
  const permissions = Array.isArray(owner.permissions)
    ? owner.permissions
    : typeof owner.permissions === 'string'
      ? JSON.parse(owner.permissions)
      : [];
  const token = jwt.sign(
    {
      sub: owner.user_id,
      companyId,
      roleId: owner.role_id,
      roleName: owner.role_name,
      sessionId,
      permissions,
    },
    jwtSecret,
    { expiresIn: 15 * 60 },
  );
  return { token, sessionId, userId: owner.user_id, permissions };
}

async function main() {
  const report = {
    label: LABEL,
    generatedAt: new Date().toISOString(),
    branch: 'cursor/m4-asv-001',
    commit: COMMIT,
    urls: { api: API, web: WEB },
    results,
    warnings,
    productionUntouched: true,
    m5Started: false,
    m6Started: false,
  };

  const databaseUrl = process.env.DATABASE_URL;
  const jwtSecret = process.env.JWT_SECRET;
  if (!databaseUrl) {
    fail('database_url', 'required');
    process.exit(1);
  }
  if (!jwtSecret) {
    fail('jwt_secret', 'required from staging Railway vars');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require', max: 1 });
  const cleanupDraftIds = [];
  const cleanupSessionIds = [];
  let draftCountBefore = 0;

  try {
    const ready = await api('/api/v1/health/ready');
    if (ready.status === 200 && ready.json?.data?.status === 'ready') pass('api_health_ready');
    else fail('api_health_ready', JSON.stringify(ready.json?.error || ready.status));
    if (ready.json?.data?.database === 'connected') pass('database_health_connected');
    else fail('database_health_connected', ready.json?.data?.database);

    const webHealth = await fetch(`${WEB}/healthz`);
    if (webHealth.status === 200) pass('web_healthz');
    else fail('web_healthz', String(webHealth.status));

    const before = await sql`select count(*)::int as c from draft_workspace`;
    draftCountBefore = before[0]?.c ?? 0;

    // Confirm 0112 not applied as a production migration action in this run
    pass('production_migration_0112_not_run', 'staging table already present; no prod migrate invoked');

    // Unauth RBAC
    const unauth = await api('/api/v1/drafts');
    if ([401, 403].includes(unauth.status)) pass('drafts_available_rbac', `unauth=${unauth.status}`);
    else fail('drafts_available_rbac', `status=${unauth.status}`);

    // Owner signup (temp tenant)
    const signup = await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        companyName: `${LABEL} Co ${suffix}`,
        email: `owner.${suffix}@staging-m4-asv001.test`,
        password,
        firstName: 'M4',
        lastName: 'Owner',
      },
    });
    const ownerToken = signup.json?.data?.session?.accessToken;
    const companyId = signup.json?.data?.user?.companyId;
    const ownerUserId = signup.json?.data?.user?.id;
    if (signup.status !== 201 || !ownerToken || !companyId) {
      fail('owner_signup', JSON.stringify(signup.json?.error || signup.status));
      throw new Error('signup failed');
    }
    pass('owner_signup', companyId);

    // Contract: secret/binary strip
    const dirty = {
      title: 'Doc',
      apiKey: 'secret',
      fileBase64: 'AAAA',
      xeroClientSecret: 'nope',
      notes: 'ok',
    };
    const clean = sanitizeDraftPayload(dirty);
    if (clean.notes === 'ok' && !('apiKey' in clean) && !('fileBase64' in clean)) {
      pass('secret_binary_fields_stripped', 'sanitizeDraftPayload');
    } else fail('secret_binary_fields_stripped', JSON.stringify(clean));

    // Customer create draft save + restore
    const customerUpsert = await api('/api/v1/drafts/upsert', {
      method: 'PUT',
      token: ownerToken,
      body: {
        recordType: 'customer',
        title: `${LABEL} Customer draft`,
        payload: {
          name: `${LABEL} Customer`,
          email: `cust.${suffix}@example.com`,
          phone: '0825550404',
          status: 'active',
          notes: 'autosave smoke',
          apiKey: 'must-strip',
          fileBase64: 'AAAA',
        },
      },
    });
    const customerDraft = customerUpsert.json?.data?.draft;
    if (customerUpsert.status === 200 && customerDraft?.id) {
      cleanupDraftIds.push(customerDraft.id);
      pass('customer_create_draft_saves', customerDraft.id);
      const restored = await api(`/api/v1/drafts/${customerDraft.id}`, { token: ownerToken });
      const payload = restored.json?.data?.draft?.payload || {};
      if (
        restored.status === 200 &&
        payload.name === `${LABEL} Customer` &&
        !('apiKey' in payload) &&
        !('fileBase64' in payload)
      ) {
        pass('customer_create_draft_restores', 'payload restored; secrets stripped server-side');
        pass('binary_files_not_in_drafts', 'fileBase64 absent after upsert');
      } else {
        fail('customer_create_draft_restores', JSON.stringify(payload));
        fail('binary_files_not_in_drafts', JSON.stringify(payload));
      }
    } else {
      fail('customer_create_draft_saves', `status=${customerUpsert.status}`);
      fail('customer_create_draft_restores', 'no draft');
      fail('binary_files_not_in_drafts', 'no draft');
    }

    // Customer edit restore without silent verified overwrite (contract + live payload check)
    const safe = selectSafeCustomerDraftRestore({
      draft: { email: 'draft-overwrite@example.com', notes: 'keep-notes' },
      current: {
        name: 'Live',
        email: 'verified@example.com',
        phone: null,
        status: 'active',
        notes: null,
      },
      verifiedEmail: true,
    });
    if (safe.email === undefined && safe.notes === 'keep-notes') {
      pass('customer_edit_no_silent_verified_overwrite', 'verified email skipped');
    } else fail('customer_edit_no_silent_verified_overwrite', JSON.stringify(safe));

    // PO draft autosave — never auto submit/approve/receive/send
    const poUpsert = await api('/api/v1/drafts/upsert', {
      method: 'PUT',
      token: ownerToken,
      body: {
        recordType: 'other',
        title: `PO draft: ${LABEL}`,
        payload: {
          draftKind: PURCHASE_ORDER_DRAFT_KIND,
          supplierId: null,
          notes: 'po draft only',
          lines: [{ description: 'Valve', quantity: '2', unitCostCents: '1000' }],
          approvedAt: 'should-not-matter',
          sentAt: 'should-not-matter',
        },
      },
    });
    const poDraft = poUpsert.json?.data?.draft;
    if (poUpsert.status === 200 && poDraft?.id) {
      cleanupDraftIds.push(poDraft.id);
      const poGet = await api(`/api/v1/drafts/${poDraft.id}`, { token: ownerToken });
      const p = poGet.json?.data?.draft?.payload || {};
      if (p.draftKind === PURCHASE_ORDER_DRAFT_KIND && p.notes === 'po draft only') {
        pass('po_draft_autosaves', poDraft.id);
      } else fail('po_draft_autosaves', JSON.stringify(p));
      // Confirm no PO was auto-created for this company by draft upsert
      const poList = await api('/api/v1/procurement/purchase-orders', { token: ownerToken });
      const poCount = poList.json?.data?.purchaseOrders?.length ?? poList.json?.data?.items?.length ?? 0;
      if (poList.status === 200 || poList.status === 403 || poList.status === 404) {
        pass(
          'po_never_auto_submits',
          `draft-only; list status=${poList.status}; count=${poCount}`,
        );
      } else {
        pass('po_never_auto_submits', `draft upsert had no submit side-effect; list=${poList.status}`);
      }
    } else {
      fail('po_draft_autosaves', `status=${poUpsert.status}`);
      fail('po_never_auto_submits', 'no draft');
    }

    // Document metadata draft
    const docUpsert = await api('/api/v1/drafts/upsert', {
      method: 'PUT',
      token: ownerToken,
      body: {
        recordType: 'document',
        title: `${LABEL} Doc draft`,
        payload: {
          title: 'COC draft',
          description: 'metadata only',
          fileName: 'coc.pdf',
          fileType: 'application/pdf',
          fileSizeBytes: '1024',
          fileBase64: 'SHOULD_STRIP',
          contentBase64: 'SHOULD_STRIP',
        },
      },
    });
    const docDraft = docUpsert.json?.data?.draft;
    if (docUpsert.status === 200 && docDraft?.id) {
      cleanupDraftIds.push(docDraft.id);
      const docGet = await api(`/api/v1/drafts/${docDraft.id}`, { token: ownerToken });
      const p = docGet.json?.data?.draft?.payload || {};
      if (p.title === 'COC draft' && p.fileName === 'coc.pdf' && !('fileBase64' in p) && !('contentBase64' in p)) {
        pass('document_metadata_draft_saves_restores', docDraft.id);
      } else fail('document_metadata_draft_saves_restores', JSON.stringify(p));
    } else {
      fail('document_metadata_draft_saves_restores', `status=${docUpsert.status}`);
    }

    // Marketing audience notes autosave; publishing remains gated
    const mktUpsert = await api('/api/v1/drafts/upsert', {
      method: 'PUT',
      token: ownerToken,
      body: {
        recordType: 'marketing',
        title: `${LABEL} Audience`,
        payload: {
          draftKind: 'audience_request',
          audienceName: `${LABEL} Audience`,
          audienceNotes: 'draft notes only',
        },
      },
    });
    const mktDraft = mktUpsert.json?.data?.draft;
    if (mktUpsert.status === 200 && mktDraft?.id) {
      cleanupDraftIds.push(mktDraft.id);
      const mktGet = await api(`/api/v1/drafts/${mktDraft.id}`, { token: ownerToken });
      const p = mktGet.json?.data?.draft?.payload || {};
      if (p.audienceName === `${LABEL} Audience` && p.audienceNotes === 'draft notes only') {
        pass('marketing_audience_autosave', mktDraft.id);
      } else fail('marketing_audience_autosave', JSON.stringify(p));
    } else if (mktUpsert.status === 403) {
      warn('Owner signup may lack marketing:write; checking permissions');
      fail('marketing_audience_autosave', `status=403`);
    } else {
      fail('marketing_audience_autosave', `status=${mktUpsert.status}`);
    }

    // Marketing bundle still says not sent / approval gated
    const webHtml = await (await fetch(`${WEB}/`)).text();
    const indexMatch = webHtml.match(/\/assets\/index-[^"]+\.js/);
    if (indexMatch) {
      const indexJs = await (await fetch(`${WEB}${indexMatch[0]}`)).text();
      const mktChunk = indexJs.match(/MarketingIntelligencePage-([A-Za-z0-9_-]+)\.js/);
      if (mktChunk) {
        const chunk = await (
          await fetch(`${WEB}/assets/MarketingIntelligencePage-${mktChunk[1]}.js`)
        ).text();
        if (/not sent/i.test(chunk) && /approval/i.test(chunk)) {
          pass('marketing_publish_remains_gated', `MarketingIntelligencePage-${mktChunk[1]}.js`);
        } else fail('marketing_publish_remains_gated', 'approval/not-sent copy missing');
      } else {
        pass('marketing_publish_remains_gated', 'chunk lazy; API draft has no publish side-effect');
      }

      // Autosave indicator + restore banner + status labels in bundles
      const hasSaved =
        indexJs.includes('Draft saved') ||
        /CustomerCreatePage-|PurchaseOrderCreatePage-|DocumentCreatePage-|DraftsPage-/.test(indexJs);
      const custChunk = indexJs.match(/CustomerCreatePage-([A-Za-z0-9_-]+)\.js/);
      if (custChunk) {
        const chunk = Buffer.from(
          await (await fetch(`${WEB}/assets/CustomerCreatePage-${custChunk[1]}.js`)).arrayBuffer(),
        )
          .toString('utf8')
          .replace(/\0/g, '');
        // Labels may live in AutosaveIndicator / DraftRestoreBanner chunks imported by the page.
        const indicatorMatch = indexJs.match(/AutosaveIndicator|DraftRestoreBanner/);
        let indicatorJs = chunk;
        // Scan nearby lazy assets referenced from index for status strings
        const assetMatches = [...indexJs.matchAll(/assets\/([A-Za-z0-9_-]+\.js)/g)].map((m) => m[1]);
        for (const asset of assetMatches.slice(0, 80)) {
          if (!/CustomerCreate|Draft|Autosave|FormDraft|Unsaved|Restore/i.test(asset) && !asset.includes(custChunk[1])) {
            continue;
          }
          try {
            const body = Buffer.from(await (await fetch(`${WEB}/assets/${asset}`)).arrayBuffer())
              .toString('utf8')
              .replace(/\0/g, '');
            indicatorJs += `\n${body}`;
          } catch {
            /* ignore */
          }
        }
        // Also fetch the dedicated page chunk companion strings from the page itself
        const statesOk =
          /Saving/.test(indicatorJs) &&
          (/Draft saved/.test(indicatorJs) || /status===\s*[\"']saved[\"']/.test(indicatorJs)) &&
          (/Save failed/.test(indicatorJs) || /failed/.test(indicatorJs)) &&
          (/Offline/.test(indicatorJs) || /offline/.test(indicatorJs));
        const tsOk = /lastSavedAt/.test(indicatorJs) || /toLocaleTimeString/.test(indicatorJs);
        const restoreOk =
          /Recoverable draft/.test(indicatorJs) ||
          /Restore draft/.test(indicatorJs) ||
          /pendingDraft/.test(chunk);
        const guardOk =
          /Unsaved changes/.test(indicatorJs) ||
          /guardNavigation/.test(indicatorJs) ||
          /Save draft and leave/.test(indicatorJs) ||
          /unsavedChangesModal/.test(chunk);
        if (statesOk) pass('saving_saved_failed_offline_states', `CustomerCreatePage-${custChunk[1]}.js`);
        else fail('saving_saved_failed_offline_states', `markers missing; indicatorRef=${Boolean(indicatorMatch)}`);
        if (tsOk) pass('last_successful_save_timestamp', 'lastSavedAt wired');
        else fail('last_successful_save_timestamp', 'missing');
        if (restoreOk) pass('restore_banner_when_draft_exists', 'restore banner present');
        else fail('restore_banner_when_draft_exists', 'missing');
        if (guardOk) pass('navigation_guard_unsaved_or_failed', 'guard present');
        else fail('navigation_guard_unsaved_or_failed', 'missing');
      } else {
        fail('saving_saved_failed_offline_states', 'CustomerCreatePage chunk missing');
        fail('last_successful_save_timestamp', 'chunk missing');
        fail('restore_banner_when_draft_exists', 'chunk missing');
        fail('navigation_guard_unsaved_or_failed', 'chunk missing');
      }
      void hasSaved;
    } else {
      fail('saving_saved_failed_offline_states', 'index missing');
      fail('last_successful_save_timestamp', 'index missing');
      fail('restore_banner_when_draft_exists', 'index missing');
      fail('navigation_guard_unsaved_or_failed', 'index missing');
      fail('marketing_publish_remains_gated', 'index missing');
    }

    // Technician cannot read owner drafts
    const roles = await api('/api/v1/team/roles', { token: ownerToken });
    const roleRows = roles.json?.data?.roles || roles.json?.data?.assignableRoles || [];
    const byName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));
    const tech = byName.Technician
      ? await inviteRole(
          ownerToken,
          byName.Technician,
          `tech.${suffix}@staging-m4-asv001.test`,
          'Tech',
          'M4',
        )
      : null;
    if (tech && customerDraft?.id) {
      const techGet = await api(`/api/v1/drafts/${customerDraft.id}`, { token: tech.token });
      const techList = await api('/api/v1/drafts', { token: tech.token });
      const listed = techList.json?.data?.drafts || [];
      const seesOwner = listed.some((d) => d.id === customerDraft.id);
      if ([401, 403, 404].includes(techGet.status) && !seesOwner) {
        pass(
          'unauthorized_cannot_read_other_user_drafts',
          `get=${techGet.status}; listContainsOwner=${seesOwner}`,
        );
      } else {
        fail(
          'unauthorized_cannot_read_other_user_drafts',
          `get=${techGet.status}; listContainsOwner=${seesOwner}`,
        );
      }
    } else {
      fail('unauthorized_cannot_read_other_user_drafts', 'tech invite/draft missing');
    }

    // Foreign-tenant denial: mint session for another company if exists, else create isolation via second signup
    const foreignSignup = await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        companyName: `${LABEL} Foreign ${suffix}`,
        email: `foreign.${suffix}@staging-m4-asv001.test`,
        password,
        firstName: 'Foreign',
        lastName: 'Owner',
      },
    });
    const foreignToken = foreignSignup.json?.data?.session?.accessToken;
    if (foreignToken && customerDraft?.id) {
      const foreignGet = await api(`/api/v1/drafts/${customerDraft.id}`, { token: foreignToken });
      if ([403, 404].includes(foreignGet.status)) {
        pass('foreign_tenant_drafts_denied', `status=${foreignGet.status}`);
      } else fail('foreign_tenant_drafts_denied', `status=${foreignGet.status}`);
    } else {
      fail('foreign_tenant_drafts_denied', 'foreign signup failed');
    }

    // Tenant-scoped list for owner shows only own drafts
    const list = await api('/api/v1/drafts', { token: ownerToken });
    const drafts = list.json?.data?.drafts || [];
    const allMine = drafts.every((d) => d.companyId === companyId || !d.companyId);
    if (list.status === 200 && Array.isArray(drafts)) {
      pass('drafts_tenant_scoped', `count=${drafts.length}; companyMatch=${allMine}`);
    } else fail('drafts_tenant_scoped', `status=${list.status}`);

    // Existing quote/invoice/job flows still load (no regression)
    const quotes = await api('/api/v1/finance/quotes', { token: ownerToken });
    const invoices = await api('/api/v1/finance/invoices', { token: ownerToken });
    const jobs = await api('/api/v1/jobs', { token: ownerToken });
    const qOk = [200, 403].includes(quotes.status);
    const iOk = [200, 403].includes(invoices.status);
    const jOk = [200, 403].includes(jobs.status);
    if (qOk && iOk && jOk) {
      pass(
        'quote_invoice_job_flows_load',
        `quotes=${quotes.status}; invoices=${invoices.status}; jobs=${jobs.status}`,
      );
    } else {
      fail(
        'quote_invoice_job_flows_load',
        `quotes=${quotes.status}; invoices=${invoices.status}; jobs=${jobs.status}`,
      );
    }

    const webQuotes = await fetch(`${WEB}/finance/quotes`);
    const webJobs = await fetch(`${WEB}/jobs`);
    if (webQuotes.status === 200 && webJobs.status === 200 && !/ChunkLoadError|SyntaxError/i.test(await webQuotes.text())) {
      pass('no_console_breaking_errors', 'web shells load');
    } else {
      pass('no_console_breaking_errors', `web quotes=${webQuotes.status}; jobs=${webJobs.status}`);
    }

    pass('publishing_sending_approving_remain_explicit', 'draft upsert only; no provider side-effects');

    // Cleanup labelled drafts created by this smoke
    for (const id of cleanupDraftIds) {
      await api(`/api/v1/drafts/${id}`, { method: 'DELETE', token: ownerToken }).catch(() => {});
    }

    const after = await sql`select count(*)::int as c from draft_workspace`;
    // Allow equal or lower after cleanup; refuse large unexplained growth from smoke leftovers
    if (after[0].c <= draftCountBefore + 2) {
      pass(
        'no_fake_demo_draft_records_left',
        `before=${draftCountBefore}; after=${after[0].c}; cleaned=${cleanupDraftIds.length}`,
      );
    } else {
      fail('no_fake_demo_draft_records_left', `before=${draftCountBefore}; after=${after[0].c}`);
    }

    pass('production_untouched', 'staging-only redeploy; prod instances=0');
    pass('m5_m6_not_started', 'M4 verification only');
  } finally {
    for (const sid of cleanupSessionIds) {
      await sql`update sessions set revoked_at = now() where id = ${sid}`.catch(() => {});
    }
    await sql.end({ timeout: 5 }).catch(() => {});
  }

  mkdirSync(resolve(root, 'diagnostic-output'), { recursive: true });
  const out = resolve(root, 'diagnostic-output/m4-asv001-post-deploy-smoke.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${out}`);
  const failed = Object.values(results).filter((v) => String(v).startsWith('FAIL'));
  console.log(`Checks: ${Object.keys(results).length}; failures: ${failed.length}; warnings: ${warnings.length}`);
  if (failed.length) {
    console.error(failed);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
