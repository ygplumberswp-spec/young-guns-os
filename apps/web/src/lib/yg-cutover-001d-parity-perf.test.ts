/**
 * YG-CUTOVER-001D — web contracts for parity + progressive load deltas.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MANAGER_PERMISSIONS, TECHNICIAN_PERMISSIONS, CLIENT_PERMISSIONS } from '@titan/auth';
import {
  YG_CUTOVER_001D_DASHBOARD_DEFER_MS,
  YG_CUTOVER_001D_HEADER_VERIFICATION,
  YG_CUTOVER_001D_VIEWPORT_CAPABILITY_MISMATCHES,
} from '@titan/shared';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return readFileSync(join(webRoot, rel), 'utf8');
}

describe('YG-CUTOVER-001D desktop/mobile parity + load performance', () => {
  it('does not gate capabilities on viewport width in app JS', () => {
    const app = read('App.tsx');
    const layout = read('layouts/AppLayout.tsx');
    assert.doesNotMatch(app, /matchMedia|innerWidth\s*[<>=]/);
    assert.doesNotMatch(layout, /matchMedia|innerWidth\s*[<>=]/);
    assert.equal(YG_CUTOVER_001D_VIEWPORT_CAPABILITY_MISMATCHES.length, 0);
  });

  it('defers finance pulse and warms Google Maps after fleet defer', () => {
    const dash = read('features/dashboard/ExecutiveDashboard.tsx');
    assert.match(dash, /DEFER_FINANCE_PULSE_MS\s*=\s*250/);
    assert.match(dash, /deferFinancePulse/);
    assert.match(dash, /warmGoogleMapsForDashboard/);
    assert.match(dash, /DashboardSectionSkeleton/);
    assert.equal(YG_CUTOVER_001D_DASHBOARD_DEFER_MS.financePulse, 250);
  });

  it('lazy-loads portal and technician field pages out of the staff entry graph', () => {
    const app = read('App.tsx');
    assert.match(app, /routes\/portal-pages/);
    assert.match(app, /routes\/mobile-pages/);
    assert.doesNotMatch(app, /from '\.\/pages\/portal\/PortalDashboardPage'/);
    assert.doesNotMatch(app, /from '\.\/pages\/mobile\/MobileDashboardPage'/);
    assert.match(read('routes/portal-pages.tsx'), /lazyNamed/);
    assert.match(read('routes/mobile-pages.tsx'), /lazyNamed/);
  });

  it('TechnicianRoute no longer duplicates session Loading spinner', () => {
    const source = read('components/StaffExperienceRoute.tsx');
    const techBlock = source.split('export function TechnicianRoute')[1] ?? '';
    assert.match(techBlock, /ProtectedRoute already gates session bootstrap/);
    assert.doesNotMatch(techBlock, /Loading\.\.\./);
  });

  it('reuses mobile header polish — no 001D rework required', () => {
    assert.equal(YG_CUTOVER_001D_HEADER_VERIFICATION.status, 'PASS_REUSED');
    const proof = readFileSync(
      join(webRoot, '../../../diagnostic-output/yg-mobile-header-polish-proof.json'),
      'utf8',
    );
    assert.match(proof, /"pass": true/);
    assert.match(proof, /titan-wordmark\.svg/);
  });

  it('preserves AURA-first dashboard ordering from 001B', () => {
    const dash = read('features/dashboard/ExecutiveDashboard.tsx');
    const auraIdx = dash.indexOf('exec-dashboard-region--aura');
    const heartbeatIdx = dash.indexOf('exec-dashboard-region--heartbeat');
    assert.ok(auraIdx >= 0 && heartbeatIdx > auraIdx);
  });

  it('Manager retains authorised surfaces; Technician/Client stay scoped (RBAC)', () => {
    assert.ok(MANAGER_PERMISSIONS.includes('agents:read'));
    assert.ok(MANAGER_PERMISSIONS.includes('intelligence:read'));
    assert.ok(MANAGER_PERMISSIONS.includes('finance:read'));
    assert.ok(MANAGER_PERMISSIONS.includes('customers:read'));
    assert.ok(MANAGER_PERMISSIONS.includes('users:manage'));
    assert.equal(MANAGER_PERMISSIONS.includes('*'), false);
    assert.ok(TECHNICIAN_PERMISSIONS.includes('jobs:read'));
    assert.equal((TECHNICIAN_PERMISSIONS as readonly string[]).includes('finance:read'), false);
    assert.ok(CLIENT_PERMISSIONS.every((p) => p.startsWith('portal.')));
  });
});
