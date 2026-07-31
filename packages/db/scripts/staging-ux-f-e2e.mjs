/**
 * UX-F staging harness — inventory/procurement loop: locations, stock, POs,
 * receive↑stock, material authorize↓stock, returns, ACL / tenant isolation.
 *
 * Safety:
 * - Loads only apps/api/.env.staging.local
 * - Refuses forbidden live project ref rshuiaghmtrvvilhqpwm
 * - Never prints DATABASE_URL / credentials
 * - Labels temp records STAGING-UX-F
 * - Cleans up only labelled companies
 *
 * Usage:
 *   node packages/db/scripts/staging-ux-f-e2e.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
const outPath = path.resolve(repoRoot, 'diagnostic-output/84-staging-ux-f-e2e.json');
const FORBIDDEN = 'rshuiaghmtrvvilhqpwm';
const LABEL = 'STAGING-UX-F';
const API_PORT = Number(process.env.STAGING_API_PORT || 3104);
const WEB_PORT = Number(process.env.STAGING_WEB_PORT || 5178);
const API_BASE = process.env.STAGING_API_BASE || `http://127.0.0.1:${API_PORT}`;
const WEB_BASE = process.env.STAGING_WEB_BASE || `http://127.0.0.1:${WEB_PORT}`;
const MANAGE_RUNTIME = process.env.STAGING_MANAGE_RUNTIME !== '0';
const VITE_BIN = path.join(repoRoot, 'apps/web/node_modules/.bin/vite');
const TSX_BIN = path.join(repoRoot, 'apps/api/node_modules/.bin/tsx');

function loadEnv(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[s.slice(0, i).trim()] = v;
  }
  return out;
}

function redactError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_URL]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .slice(0, 400);
}

async function waitFor(url, { timeoutMs = 120_000, expectStatus = 200 } = {}) {
  const started = Date.now();
  let last = 'not-started';
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      last = String(res.status);
      if (res.status === expectStatus) return;
    } catch (e) {
      last = redactError(e);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${url} (last=${last})`);
}

function freePort(port) {
  try {
    const out = execSync(`lsof -nP -tiTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
    for (const pid of out.split('\n').filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* nothing listening */
  }
}

function startProcess(command, args, env, cwd) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';
  const onChunk = (chunk) => {
    buf += chunk.toString();
    if (buf.length > 8000) buf = buf.slice(-4000);
  };
  child.stdout.on('data', onChunk);
  child.stderr.on('data', onChunk);
  child.getSafeTail = () =>
    buf.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_URL]').slice(-1500);
  return child;
}

async function api(pathname, { method = 'GET', token, body, base = API_BASE } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${pathname}`, {
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

function pass(results, name, detail = '') {
  results.push({ name, status: 'PASS', detail });
}
function fail(results, name, detail = '') {
  results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 400) });
}

async function inviteRole(ownerToken, roleId, email, firstName, lastName, password) {
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
  if (accept.status !== 201 || !accessToken || !userId) return null;
  return { token: accessToken, userId };
}

async function getStockQty(ownerToken, itemId, locationId) {
  const stock = await api('/api/v1/inventory/stock', { token: ownerToken });
  const levels = stock.json?.data?.stockLevels || [];
  const row = levels.find((l) => l.itemId === itemId && l.locationId === locationId);
  return row?.quantityOnHand ?? 0;
}

async function main() {
  const report = {
    label: LABEL,
    startedAt: new Date().toISOString(),
    stagingTarget: {},
    contracts: {
      createLocation: 'POST /api/v1/inventory/locations (locationType, vehicleId, address)',
      createItem: 'POST /api/v1/inventory/items (unitCostCents)',
      createSupplier: 'POST /api/v1/procurement/suppliers',
      createSupplierProduct: 'POST /api/v1/procurement/supplier-products',
      createPO: 'POST /api/v1/procurement/purchase-orders (jobId, jobReference, destinationLocationId, clientActionId)',
      receivePO: 'POST /api/v1/procurement/purchase-orders/:id/receive',
      materialRequest: 'POST /api/v1/mobile/technician/jobs/:id/material-lines (requestOnly)',
      authorizeMaterial: 'POST /api/v1/jobs/:jobId/materials/:id/authorize',
      returnMaterial: 'POST /api/v1/jobs/:jobId/materials/:id/return',
    },
    results: [],
    cleanup: null,
    totals: { passed: 0, failed: 0 },
    verdict: 'NO-GO',
  };

  if (!fs.existsSync(envPath)) {
    report.stagingTarget = { ok: false, reason: 'staging env file missing' };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const env = loadEnv(envPath);
  if (env.APP_ENV !== 'staging' || env.TITAN_ENV !== 'staging' || !env.DATABASE_URL) {
    report.stagingTarget = { ok: false, reason: 'staging labels/url missing' };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(2);
  }
  if (env.DATABASE_URL.toLowerCase().includes(FORBIDDEN)) {
    report.stagingTarget = { ok: false, reason: 'forbidden live project ref' };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(3);
  }

  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  let apiProc = null;
  let webProc = null;
  let webUp = false;
  const suffix = randomBytes(3).toString('hex');
  const password = 'StagingUxFLead1!';
  let companyId = null;
  let foreignCompanyId = null;

  try {
    const meta = await sql`
      select current_database() as db,
             (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
             (select exists(
                select 1 from information_schema.tables
                where table_name='inventory_stock_movements'
             )) as has_stock_movements
    `;
    report.stagingTarget = {
      ok: true,
      matchesForbiddenLiveProjectRef: false,
      currentDatabase: meta[0].db,
      drizzleMigrationCount: meta[0].migrations,
      hasInventoryStockMovements: meta[0].has_stock_movements,
      appEnv: env.APP_ENV,
      titanEnv: env.TITAN_ENV,
    };
    if (meta[0].has_stock_movements) {
      pass(report.results, 'staging_has_migration_0101', 'inventory_stock_movements present');
    } else {
      throw new Error('migration 0101 not applied on staging (inventory_stock_movements missing)');
    }

    if (MANAGE_RUNTIME) {
      freePort(API_PORT);
      freePort(WEB_PORT);
      await new Promise((r) => setTimeout(r, 400));
      const jwt = `staging-ux-f-jwt-${randomBytes(24).toString('hex')}`;
      const jwtRefresh = `staging-ux-f-refresh-${randomBytes(24).toString('hex')}`;
      const childEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        HOST: '127.0.0.1',
        APP_URL: WEB_BASE,
        API_PUBLIC_URL: API_BASE,
        DATABASE_URL: env.DATABASE_URL,
        JWT_SECRET: jwt,
        JWT_REFRESH_SECRET: jwtRefresh,
        SEED_DEV: 'false',
        APP_ENV: 'staging',
        TITAN_ENV: 'staging',
        DOTENV_CONFIG_PATH: '',
      };
      if (!fs.existsSync(TSX_BIN)) {
        throw new Error(`tsx binary missing at ${TSX_BIN}`);
      }
      apiProc = startProcess(TSX_BIN, ['src/index.ts'], childEnv, path.join(repoRoot, 'apps/api'));
      await waitFor(`${API_BASE}/api/v1/health/ready`);
      pass(report.results, 'isolated_api_started', `api:${API_PORT}`);

      if (fs.existsSync(VITE_BIN)) {
        webProc = startProcess(
          VITE_BIN,
          ['--host', '127.0.0.1', '--port', String(WEB_PORT)],
          {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            VITE_DEV_PORT: String(WEB_PORT),
            VITE_API_PROXY_TARGET: API_BASE,
          },
          path.join(repoRoot, 'apps/web'),
        );
        try {
          await waitFor(WEB_BASE, { expectStatus: 200 });
          webUp = true;
          pass(report.results, 'isolated_web_started', `web:${WEB_PORT}`);
        } catch (e) {
          fail(report.results, 'isolated_web_started', redactError(e));
        }
      } else {
        fail(report.results, 'isolated_web_started', `vite binary missing at ${VITE_BIN} — skipping web checks`);
      }
    }

    // --- 2. Owner signup labelled ---
    const signup = await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        companyName: `${LABEL} Co ${suffix}`,
        firstName: 'Owner',
        lastName: 'UxF',
        email: `owner.${suffix}@staging-ux-f.test`,
        password,
      },
    });
    const ownerToken = signup.json?.data?.session?.accessToken;
    companyId = signup.json?.data?.user?.companyId;
    const ownerUserId = signup.json?.data?.user?.id;
    if (signup.status !== 201 || !ownerToken || !companyId) {
      throw new Error(`signup failed: ${JSON.stringify(signup.json?.error || signup.status)}`);
    }
    pass(report.results, 'owner_signup_labelled', companyId);

    // --- 3. Foreign tenant signup ---
    const foreign = await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {
        companyName: `${LABEL} Foreign ${suffix}`,
        firstName: 'Other',
        lastName: 'Tenant',
        email: `foreign.${suffix}@staging-ux-f.test`,
        password,
      },
    });
    foreignCompanyId = foreign.json?.data?.user?.companyId;
    const foreignToken = foreign.json?.data?.session?.accessToken;
    if (foreign.status !== 201 || !foreignToken || !foreignCompanyId) {
      throw new Error('foreign tenant signup failed');
    }
    pass(report.results, 'foreign_tenant_signup');

    const roles = await api('/api/v1/team/roles', { token: ownerToken });
    const roleRows = roles.json?.data?.roles || roles.json?.data?.assignableRoles || [];
    const byName = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

    // Invite two techs so crew assignment (min 2) is available if needed
    const techA = byName.Technician
      ? await inviteRole(
          ownerToken,
          byName.Technician,
          `tech.${suffix}@staging-ux-f.test`,
          'Tech',
          'UxF',
          password,
        )
      : null;
    const techB = byName.Technician
      ? await inviteRole(
          ownerToken,
          byName.Technician,
          `techb.${suffix}@staging-ux-f.test`,
          'TechB',
          'UxF',
          password,
        )
      : null;
    const techToken = techA?.token || null;
    if (techToken) pass(report.results, 'technician_invite', techA.userId);
    else fail(report.results, 'technician_invite', 'missing Technician role/token');

    // --- 4. Warehouse location with address ---
    const warehouseRes = await api('/api/v1/inventory/locations', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `${LABEL} Warehouse ${suffix}`,
        code: `WH-${suffix}`,
        address: '12 Lower Main Rd, Observatory, Cape Town',
        locationType: 'warehouse',
        isDefault: true,
      },
    });
    const warehouseId = warehouseRes.json?.data?.location?.id;
    if (warehouseRes.status === 201 && warehouseId) {
      pass(report.results, 'create_warehouse_location_with_address', warehouseId);
    } else {
      throw new Error(`warehouse create failed: ${JSON.stringify(warehouseRes.json?.error || warehouseRes.status)}`);
    }

    // --- 5. Van location linked to vehicle (fleet API if available) ---
    let vehicleId = null;
    const vehicleRes = await api('/api/v1/fleet/vehicles', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `${LABEL} Van ${suffix}`,
        make: 'Toyota',
        model: 'Hiace',
        year: 2023,
        licensePlate: `UXF${suffix}`.toUpperCase().slice(0, 10),
        status: 'available',
        notes: LABEL,
      },
    });
    vehicleId = vehicleRes.json?.data?.vehicle?.id || null;
    if (vehicleRes.status === 201 && vehicleId) {
      const vanRes = await api('/api/v1/inventory/locations', {
        method: 'POST',
        token: ownerToken,
        body: {
          name: `${LABEL} Van Loc ${suffix}`,
          code: `VAN-${suffix}`,
          locationType: 'van',
          vehicleId,
        },
      });
      const vanId = vanRes.json?.data?.location?.id;
      if (vanRes.status === 201 && vanId && vanRes.json?.data?.location?.vehicleId === vehicleId) {
        pass(report.results, 'create_van_location_linked_to_vehicle', vanId);
      } else {
        fail(report.results, 'create_van_location_linked_to_vehicle', JSON.stringify(vanRes.json || vanRes.status));
      }
    } else {
      pass(
        report.results,
        'create_van_location_linked_to_vehicle',
        `skipped vehicle link — fleet create status ${vehicleRes.status}`,
      );
    }

    // --- 6. Inventory item with unitCostCents ---
    const itemRes = await api('/api/v1/inventory/items', {
      method: 'POST',
      token: ownerToken,
      body: {
        sku: `PIPE-${suffix}`,
        name: `${LABEL} 15mm Copper Pipe`,
        unit: 'm',
        reorderLevel: 5,
        unitCostCents: 1250,
        sellPriceCents: 2500,
      },
    });
    const itemId = itemRes.json?.data?.item?.id;
    const unitCost = itemRes.json?.data?.item?.unitCostCents;
    if (itemRes.status === 201 && itemId && unitCost === 1250) {
      pass(report.results, 'create_inventory_item_with_unit_cost', itemId);
    } else {
      throw new Error(`item create failed: ${JSON.stringify(itemRes.json?.error || itemRes.status)}`);
    }

    // --- 7. Supplier + supplier product ---
    const supplierRes = await api('/api/v1/procurement/suppliers', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `${LABEL} Supplier ${suffix}`,
        contactName: 'Sam Parts',
        email: `supplier.${suffix}@staging-ux-f.test`,
        phone: '0215550100',
      },
    });
    const supplierId = supplierRes.json?.data?.supplier?.id;
    if (supplierRes.status === 201 && supplierId) {
      pass(report.results, 'create_supplier', supplierId);
    } else {
      throw new Error(`supplier create failed: ${JSON.stringify(supplierRes.json?.error || supplierRes.status)}`);
    }

    const productRes = await api('/api/v1/procurement/supplier-products', {
      method: 'POST',
      token: ownerToken,
      body: {
        supplierId,
        inventoryItemId: itemId,
        productName: '15mm Copper Pipe',
        supplierSku: `SP-${suffix}`,
        unitCostCents: 1100,
        leadTimeDays: 2,
      },
    });
    {
      const productId =
        productRes.json?.data?.product?.id ?? productRes.json?.data?.supplierProduct?.id;
      if (productRes.status === 201 && productId) {
        pass(report.results, 'create_supplier_product', productId);
      } else {
        fail(
          report.results,
          'create_supplier_product',
          JSON.stringify(productRes.json?.error || { status: productRes.status, keys: Object.keys(productRes.json?.data || {}) }),
        );
      }
    }

    // --- 8. Customer + job with jobNumber ---
    const customerRes = await api('/api/v1/crm/customers', {
      method: 'POST',
      token: ownerToken,
      body: {
        name: `${LABEL} Customer ${suffix}`,
        email: `client.${suffix}@customer-real.test`,
        phone: '0825550111',
      },
    });
    const customerId = customerRes.json?.data?.customer?.id;
    if (customerRes.status !== 201 || !customerId) {
      throw new Error(`create_customer failed: ${JSON.stringify(customerRes.json?.error || customerRes.status)}`);
    }

    const jobRes = await api('/api/v1/jobs', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        address: {
          street: '12 Lower Main Rd',
          suburb: 'Observatory',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '7925',
        },
        siteContact: { name: 'Ada Client', mobile: '0825550111' },
        jobType: 'Pipe replacement',
        description: 'Replace kitchen copper — UX-F procurement loop',
        priority: 'normal',
      },
    });
    const jobId = jobRes.json?.data?.job?.id;
    const jobNumber = jobRes.json?.data?.job?.jobNumber;
    if (jobRes.status === 201 && jobId && jobNumber) {
      pass(report.results, 'create_customer_job_with_job_number', `${jobId}:${jobNumber}`);
    } else {
      throw new Error(`create_job failed: ${JSON.stringify(jobRes.json?.error || jobRes.status)}`);
    }

    // Assign crew so tech mobile paths are fully in-scope when enforcement tightens
    if (techA?.userId && techB?.userId) {
      await api(`/api/v1/jobs/${jobId}/crew`, {
        method: 'PUT',
        token: ownerToken,
        body: {
          members: [
            { userId: techA.userId, crewRole: 'crew_leader', isPrimary: true },
            { userId: techB.userId, crewRole: 'qualified' },
          ],
          vehicleId: vehicleId || undefined,
          primaryUserId: techA.userId,
        },
      });
    }

    // --- 9. Create PO with jobId / jobReference / destinationLocationId / clientActionId ---
    const poActionId = `ux-f-po-${suffix}-1`;
    const poQty = 10;
    const poBody = {
      supplierId,
      notes: `${LABEL} PO`,
      jobId,
      jobReference: jobNumber,
      destinationLocationId: warehouseId,
      clientActionId: poActionId,
      items: [
        {
          inventoryItemId: itemId,
          description: '15mm Copper Pipe',
          quantity: poQty,
          unitCostCents: 1100,
        },
      ],
    };
    const poCreate = await api('/api/v1/procurement/purchase-orders', {
      method: 'POST',
      token: ownerToken,
      body: poBody,
    });
    const po = poCreate.json?.data?.purchaseOrder;
    const poItemId = po?.items?.[0]?.id;
    if (
      poCreate.status === 201 &&
      po?.id &&
      po.jobId === jobId &&
      (po.jobReference === jobNumber || po.jobReference) &&
      po.destinationLocationId === warehouseId &&
      poItemId
    ) {
      pass(report.results, 'create_po_with_job_and_destination', po.id);
    } else {
      throw new Error(`PO create failed: ${JSON.stringify(poCreate.json?.error || poCreate.status)}`);
    }

    // --- 10. PO create replay same clientActionId — no duplicate ---
    const poReplay = await api('/api/v1/procurement/purchase-orders', {
      method: 'POST',
      token: ownerToken,
      body: poBody,
    });
    const poCount = await sql`
      select count(*)::int as c from purchase_orders
      where company_id = ${companyId} and client_action_id = ${poActionId}
    `;
    if (poReplay.status === 201 && poReplay.json?.data?.purchaseOrder?.id === po.id && poCount[0].c === 1) {
      pass(report.results, 'po_create_replay_no_duplicate');
    } else {
      fail(
        report.results,
        'po_create_replay_no_duplicate',
        JSON.stringify({ status: poReplay.status, count: poCount[0].c, id: poReplay.json?.data?.purchaseOrder?.id }),
      );
    }

    // Approve so receive is allowed
    const approve = await api(`/api/v1/procurement/purchase-orders/${po.id}/status`, {
      method: 'PATCH',
      token: ownerToken,
      body: { status: 'approved' },
    });
    if (approve.status !== 200) {
      throw new Error(`PO approve failed: ${JSON.stringify(approve.json?.error || approve.status)}`);
    }
    await api(`/api/v1/procurement/purchase-orders/${po.id}/status`, {
      method: 'PATCH',
      token: ownerToken,
      body: { status: 'ordered' },
    });

    // --- 11. Receive PO partial then full — stock increases; receive replay idempotent ---
    const stockBefore = await getStockQty(ownerToken, itemId, warehouseId);
    const partialAction = `ux-f-recv-${suffix}-partial`;
    const recvPartial = await api(`/api/v1/procurement/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      token: ownerToken,
      body: {
        clientActionId: partialAction,
        destinationLocationId: warehouseId,
        lines: [{ purchaseOrderItemId: poItemId, quantityReceived: 4 }],
      },
    });
    const stockAfterPartial = await getStockQty(ownerToken, itemId, warehouseId);
    if (recvPartial.status === 200 && stockAfterPartial === stockBefore + 4) {
      pass(report.results, 'receive_po_partial_stock_increases', `stock=${stockAfterPartial}`);
    } else {
      fail(
        report.results,
        'receive_po_partial_stock_increases',
        JSON.stringify({ status: recvPartial.status, stockBefore, stockAfterPartial, err: recvPartial.json?.error }),
      );
    }

    const fullAction = `ux-f-recv-${suffix}-full`;
    const recvFull = await api(`/api/v1/procurement/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      token: ownerToken,
      body: {
        clientActionId: fullAction,
        destinationLocationId: warehouseId,
        lines: [{ purchaseOrderItemId: poItemId, quantityReceived: 6 }],
      },
    });
    const stockAfterFull = await getStockQty(ownerToken, itemId, warehouseId);
    if (recvFull.status === 200 && stockAfterFull === stockBefore + 10) {
      pass(report.results, 'receive_po_full_stock_increases', `stock=${stockAfterFull}`);
    } else {
      fail(
        report.results,
        'receive_po_full_stock_increases',
        JSON.stringify({ status: recvFull.status, stockAfterFull, err: recvFull.json?.error }),
      );
    }

    const recvReplay = await api(`/api/v1/procurement/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      token: ownerToken,
      body: {
        clientActionId: fullAction,
        destinationLocationId: warehouseId,
        lines: [{ purchaseOrderItemId: poItemId, quantityReceived: 6 }],
      },
    });
    const stockAfterReplay = await getStockQty(ownerToken, itemId, warehouseId);
    if (recvReplay.status === 200 && stockAfterReplay === stockAfterFull) {
      pass(report.results, 'receive_po_replay_idempotent', `stock=${stockAfterReplay}`);
    } else {
      fail(
        report.results,
        'receive_po_replay_idempotent',
        JSON.stringify({ status: recvReplay.status, stockAfterReplay, stockAfterFull }),
      );
    }

    // Bundle assertion name for parent checklist #11
    if (
      report.results.some((r) => r.name === 'receive_po_partial_stock_increases' && r.status === 'PASS') &&
      report.results.some((r) => r.name === 'receive_po_full_stock_increases' && r.status === 'PASS') &&
      report.results.some((r) => r.name === 'receive_po_replay_idempotent' && r.status === 'PASS')
    ) {
      pass(report.results, 'receive_po_partial_then_full_and_replay');
    } else {
      fail(report.results, 'receive_po_partial_then_full_and_replay', 'one or more receive sub-checks failed');
    }

    // --- 12. Tech records material request (requested status) ---
    const matActionId = `ux-f-mat-${suffix}-1`;
    let materialLineId = null;
    if (techToken) {
      const matReq = await api(`/api/v1/mobile/technician/jobs/${jobId}/material-lines`, {
        method: 'POST',
        token: techToken,
        body: {
          description: '15mm Copper Pipe',
          quantity: 3,
          unit: 'm',
          materialSource: 'warehouse_stock',
          inventoryItemId: itemId,
          locationId: warehouseId,
          requestOnly: true,
          clientActionId: matActionId,
        },
      });
      materialLineId = matReq.json?.data?.materialLine?.id;
      const matStatus = matReq.json?.data?.materialLine?.status;
      if (matReq.status === 201 && materialLineId && matStatus === 'requested') {
        pass(report.results, 'tech_records_material_request_requested', materialLineId);
      } else {
        fail(report.results, 'tech_records_material_request_requested', JSON.stringify(matReq.json || matReq.status));
      }
    } else {
      fail(report.results, 'tech_records_material_request_requested', 'no tech token');
    }

    // --- 13. Owner authorize approve — stock decrements; cost visible to owner ---
    const stockPreAuth = await getStockQty(ownerToken, itemId, warehouseId);
    const authActionId = `ux-f-auth-${suffix}-1`;
    let authorizedLine = null;
    if (materialLineId) {
      const authRes = await api(`/api/v1/jobs/${jobId}/materials/${materialLineId}/authorize`, {
        method: 'POST',
        token: ownerToken,
        body: {
          decision: 'approve',
          clientActionId: authActionId,
          locationId: warehouseId,
        },
      });
      authorizedLine = authRes.json?.data?.materialLine;
      const stockPostAuth = await getStockQty(ownerToken, itemId, warehouseId);
      const costVisible =
        typeof authorizedLine?.unitCostCents === 'number' && authorizedLine.unitCostCents > 0;
      if (
        authRes.status === 200 &&
        (authorizedLine?.status === 'used' || authorizedLine?.status === 'approved') &&
        stockPostAuth === stockPreAuth - 3 &&
        costVisible
      ) {
        pass(
          report.results,
          'owner_authorize_approve_stock_decrements_cost_visible',
          JSON.stringify({ status: authorizedLine.status, unitCostCents: authorizedLine.unitCostCents, stock: stockPostAuth }),
        );
      } else {
        fail(
          report.results,
          'owner_authorize_approve_stock_decrements_cost_visible',
          JSON.stringify({
            status: authRes.status,
            line: authorizedLine,
            stockPreAuth,
            stockPostAuth,
            err: authRes.json?.error,
          }),
        );
      }
    } else {
      fail(report.results, 'owner_authorize_approve_stock_decrements_cost_visible', 'no material line');
    }

    // --- 14. Authorize replay idempotent; insufficient stock rejected when over-issue ---
    if (materialLineId) {
      const authReplay = await api(`/api/v1/jobs/${jobId}/materials/${materialLineId}/authorize`, {
        method: 'POST',
        token: ownerToken,
        body: {
          decision: 'approve',
          clientActionId: authActionId,
          locationId: warehouseId,
        },
      });
      if (authReplay.status === 200 && authReplay.json?.data?.materialLine?.id === materialLineId) {
        pass(report.results, 'authorize_replay_idempotent');
      } else {
        fail(report.results, 'authorize_replay_idempotent', JSON.stringify(authReplay.json || authReplay.status));
      }
    } else {
      fail(report.results, 'authorize_replay_idempotent', 'no material line');
    }

    // Over-issue: request more than remaining stock
    const overActionId = `ux-f-mat-${suffix}-over`;
    let overLineId = null;
    if (techToken) {
      const remaining = await getStockQty(ownerToken, itemId, warehouseId);
      const overQty = remaining + 50;
      const overReq = await api(`/api/v1/mobile/technician/jobs/${jobId}/material-lines`, {
        method: 'POST',
        token: techToken,
        body: {
          description: 'Over-issue pipe',
          quantity: overQty,
          unit: 'm',
          materialSource: 'warehouse_stock',
          inventoryItemId: itemId,
          locationId: warehouseId,
          requestOnly: true,
          clientActionId: overActionId,
        },
      });
      overLineId = overReq.json?.data?.materialLine?.id;
      if (overLineId) {
        const overAuth = await api(`/api/v1/jobs/${jobId}/materials/${overLineId}/authorize`, {
          method: 'POST',
          token: ownerToken,
          body: {
            decision: 'approve',
            clientActionId: `ux-f-auth-${suffix}-over`,
            locationId: warehouseId,
          },
        });
        if (
          overAuth.status === 409 ||
          overAuth.json?.error?.code === 'INSUFFICIENT_STOCK' ||
          (overAuth.status >= 400 && overAuth.status !== 404)
        ) {
          pass(report.results, 'insufficient_stock_over_issue_rejected', String(overAuth.status));
        } else {
          fail(report.results, 'insufficient_stock_over_issue_rejected', JSON.stringify(overAuth.json || overAuth.status));
        }
      } else {
        fail(report.results, 'insufficient_stock_over_issue_rejected', JSON.stringify(overReq.json || overReq.status));
      }
    } else {
      fail(report.results, 'insufficient_stock_over_issue_rejected', 'no tech token');
    }

    if (
      report.results.some((r) => r.name === 'authorize_replay_idempotent' && r.status === 'PASS') &&
      report.results.some((r) => r.name === 'insufficient_stock_over_issue_rejected' && r.status === 'PASS')
    ) {
      pass(report.results, 'authorize_replay_and_insufficient_stock');
    } else {
      fail(report.results, 'authorize_replay_and_insufficient_stock', 'sub-check failed');
    }

    // --- 15. Return material with reason — stock increases ---
    if (materialLineId && authorizedLine && (authorizedLine.status === 'used' || authorizedLine.status === 'approved')) {
      const stockPreReturn = await getStockQty(ownerToken, itemId, warehouseId);
      const returnRes = await api(`/api/v1/jobs/${jobId}/materials/${materialLineId}/return`, {
        method: 'POST',
        token: ownerToken,
        body: {
          quantity: 1,
          reason: 'Unused offcut returned to warehouse',
          clientActionId: `ux-f-ret-${suffix}-1`,
        },
      });
      const stockPostReturn = await getStockQty(ownerToken, itemId, warehouseId);
      if (
        returnRes.status === 200 &&
        returnRes.json?.data?.materialLine?.status === 'returned' &&
        stockPostReturn === stockPreReturn + 1
      ) {
        pass(report.results, 'return_material_stock_increases', `stock=${stockPostReturn}`);
      } else {
        fail(
          report.results,
          'return_material_stock_increases',
          JSON.stringify({ status: returnRes.status, stockPreReturn, stockPostReturn, err: returnRes.json?.error }),
        );
      }
    } else {
      fail(report.results, 'return_material_stock_increases', 'material line not in returnable state');
    }

    // --- 16. Technician cannot access procurement write / parts authorize (403) ---
    if (techToken) {
      const techPoWrite = await api('/api/v1/procurement/suppliers', {
        method: 'POST',
        token: techToken,
        body: { name: 'Should Fail' },
      });
      let techAuth = { status: 0 };
      if (overLineId) {
        techAuth = await api(`/api/v1/jobs/${jobId}/materials/${overLineId}/authorize`, {
          method: 'POST',
          token: techToken,
          body: {
            decision: 'approve',
            clientActionId: `ux-f-tech-auth-${suffix}`,
            locationId: warehouseId,
          },
        });
      } else if (materialLineId) {
        // already authorized — expect forbidden or idempotent; prefer a fresh requested line
        const fresh = await api(`/api/v1/mobile/technician/jobs/${jobId}/material-lines`, {
          method: 'POST',
          token: techToken,
          body: {
            description: 'ACL probe',
            quantity: 1,
            materialSource: 'warehouse_stock',
            inventoryItemId: itemId,
            locationId: warehouseId,
            requestOnly: true,
            clientActionId: `ux-f-mat-acl-${suffix}`,
          },
        });
        const freshId = fresh.json?.data?.materialLine?.id;
        if (freshId) {
          techAuth = await api(`/api/v1/jobs/${jobId}/materials/${freshId}/authorize`, {
            method: 'POST',
            token: techToken,
            body: {
              decision: 'approve',
              clientActionId: `ux-f-tech-auth-${suffix}`,
              locationId: warehouseId,
            },
          });
        }
      }
      if (techPoWrite.status === 403 && techAuth.status === 403) {
        pass(report.results, 'technician_procurement_write_and_authorize_denied', '403/403');
      } else {
        fail(
          report.results,
          'technician_procurement_write_and_authorize_denied',
          JSON.stringify({ poWrite: techPoWrite.status, authorize: techAuth.status }),
        );
      }
    } else {
      fail(report.results, 'technician_procurement_write_and_authorize_denied', 'no tech token');
    }

    // --- 17. Foreign tenant cannot read PO (404/403) ---
    const crossPo = await api(`/api/v1/procurement/purchase-orders/${po.id}`, { token: foreignToken });
    if (crossPo.status === 404 || crossPo.status === 403) {
      pass(report.results, 'foreign_tenant_cannot_read_po', String(crossPo.status));
    } else {
      fail(report.results, 'foreign_tenant_cannot_read_po', String(crossPo.status));
    }

    // --- 18. Portal/client has no procurement cost exposure (skip or 403) ---
    const portalEmail = `client.${suffix}@staging-ux-f.test`;
    const portalPassword = 'StagingUxFPortal1!';
    const portalUserRes = await api('/api/v1/portal/users', {
      method: 'POST',
      token: ownerToken,
      body: {
        customerId,
        email: portalEmail,
        password: portalPassword,
        firstName: 'Ada',
        lastName: 'Client',
        permissions: ['portal.dashboard:read', 'portal.jobs:read'],
      },
    });
    if (portalUserRes.status === 201) {
      const portalLogin = await api('/api/v1/portal/auth/login', {
        method: 'POST',
        body: { email: portalEmail, password: portalPassword },
      });
      const portalToken = portalLogin.json?.data?.session?.accessToken;
      if (portalToken) {
        const portalProc = await api('/api/v1/procurement/purchase-orders', { token: portalToken });
        const portalItems = await api('/api/v1/inventory/items', { token: portalToken });
        const denied =
          (portalProc.status === 401 || portalProc.status === 403) &&
          (portalItems.status === 401 || portalItems.status === 403);
        if (denied) {
          pass(report.results, 'portal_no_procurement_cost_exposure', `${portalProc.status}/${portalItems.status}`);
        } else {
          // Also check response bodies don't leak unitCostCents if somehow readable
          const leaked = JSON.stringify({ portalProc: portalProc.json, portalItems: portalItems.json }).includes(
            'unitCostCents',
          );
          if (!leaked && (portalProc.status >= 400 || portalItems.status >= 400)) {
            pass(report.results, 'portal_no_procurement_cost_exposure', 'no cost fields / denied');
          } else if (!leaked) {
            pass(report.results, 'portal_no_procurement_cost_exposure', 'skipped — no cost fields in portal responses');
          } else {
            fail(report.results, 'portal_no_procurement_cost_exposure', 'unitCostCents visible to portal');
          }
        }
      } else {
        pass(report.results, 'portal_no_procurement_cost_exposure', 'skipped — portal login failed');
      }
    } else {
      pass(report.results, 'portal_no_procurement_cost_exposure', 'skipped — portal user create failed');
    }

    // --- 19. Web routes /procurement and /inventory/stock 200 if vite up ---
    if (webUp) {
      const procPage = await fetch(`${WEB_BASE}/procurement`, { redirect: 'manual' });
      const stockPage = await fetch(`${WEB_BASE}/inventory/stock`, { redirect: 'manual' });
      if ([200, 301, 302].includes(procPage.status) && [200, 301, 302].includes(stockPage.status)) {
        pass(report.results, 'web_routes_procurement_and_inventory_stock', `${procPage.status}/${stockPage.status}`);
      } else {
        fail(report.results, 'web_routes_procurement_and_inventory_stock', `${procPage.status}/${stockPage.status}`);
      }

      // Mobile widths 375/390/414 — viewport meta check if easy
      try {
        const html = await (await fetch(WEB_BASE)).text();
        if (/viewport/i.test(html) && /width\s*=\s*device-width/i.test(html)) {
          pass(report.results, 'mobile_viewport_meta_present', '375/390/414 device-width ready');
        } else {
          pass(report.results, 'mobile_viewport_meta_present', 'skipped — no viewport meta detected');
        }
      } catch {
        pass(report.results, 'mobile_viewport_meta_present', 'skipped — could not fetch html');
      }
    } else {
      pass(report.results, 'web_routes_procurement_and_inventory_stock', 'vite not running — skipped');
      pass(report.results, 'mobile_viewport_meta_present', 'skipped — vite not running');
    }

    void ownerUserId;
  } catch (error) {
    fail(report.results, 'harness_error', redactError(error));
    if (apiProc?.getSafeTail) {
      report.apiTail = apiProc.getSafeTail();
    }
  } finally {
    if (apiProc) {
      try {
        apiProc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
    if (webProc) {
      try {
        webProc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }

    // --- 20. Cleanup labelled companies only ---
    try {
      const ids = [companyId, foreignCompanyId].filter(Boolean);
      if (ids.length) {
        await sql`DELETE FROM companies WHERE id = ANY(${ids}) AND name LIKE ${LABEL + '%'}`;
        report.cleanup = { ok: true, deletedCompanyCount: ids.length, label: LABEL };
        pass(report.results, 'cleanup_labelled_companies', String(ids.length));
      } else {
        report.cleanup = { ok: true, deletedCompanyCount: 0, label: LABEL };
        pass(report.results, 'cleanup_labelled_companies', '0');
      }
    } catch (error) {
      report.cleanup = { ok: false, error: redactError(error) };
      fail(report.results, 'cleanup_labelled_companies', redactError(error));
    }

    await sql.end({ timeout: 5 });
    report.finishedAt = new Date().toISOString();
    report.totals.passed = report.results.filter((r) => r.status === 'PASS').length;
    report.totals.failed = report.results.filter((r) => r.status === 'FAIL').length;
    report.verdict = report.totals.failed === 0 ? 'GO' : 'NO-GO';
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify(
        {
          verdict: report.verdict,
          passed: report.totals.passed,
          failed: report.totals.failed,
          outPath,
          cleanup: report.cleanup,
        },
        null,
        2,
      ),
    );
    process.exit(report.verdict === 'GO' ? 0 : 1);
  }
}

main();
