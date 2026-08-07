/**
 * YG-CUTOVER-001B — Manager mobile clipping / responsive contracts.
 * Preserves OWNER-001 desktop full-bleed while asserting phone pad + safe-area.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  MANAGER_PERMISSIONS,
  MANAGER_ROLE_NAME,
  COMPANY_OWNER_ROLE_NAME,
  canAssignRoleName,
  hasAnyPermission,
} from '@titan/auth';
import {
  YG_CUTOVER_001B_GOOGLE_MAPS_EVIDENCE,
  YG_CUTOVER_001B_MANAGER_RBAC_MATRIX,
  YG_CUTOVER_001B_MOBILE_BREAKPOINTS,
  canViewOwnerFinancialCommand,
} from '@titan/shared';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return readFileSync(join(webRoot, rel), 'utf8');
}

describe('YG-CUTOVER-001B responsive clipping fix', () => {
  it('restores owner001 phone pad-x without changing desktop dense clamp', () => {
    const layout = read('styles/layout-grid.css');
    assert.match(
      layout,
      /\.titan-shell__main:has\(\.exec-dashboard-page--owner001\)\s*\{[\s\S]*clamp\(0\.5rem,\s*1vw,\s*1rem\)/,
    );
    assert.match(layout, /@media \(max-width: 760px\)[\s\S]*--titan-page-pad-x:\s*1rem/);
    assert.match(layout, /@media \(max-width: 430px\)[\s\S]*--titan-page-pad-x:\s*1rem/);
  });

  it('applies horizontal safe-area on main and hides inert off-canvas drawer', () => {
    const css = read('index.css');
    assert.match(
      css,
      /\.owner-shell \.titan-shell__main[\s\S]*padding-left:\s*max\([\s\S]*safe-area-inset-left/,
    );
    assert.match(
      css,
      /\.owner-shell \.titan-shell__sidebar[\s\S]*visibility:\s*hidden[\s\S]*pointer-events:\s*none/,
    );
    assert.match(css, /\.owner-shell--mobile-nav-open \.titan-shell__sidebar[\s\S]*visibility:\s*visible/);
  });

  it('compacts narrow iPhone header (hide Menu label)', () => {
    const css = read('index.css');
    assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.app-header__menu-label[\s\S]*display:\s*none/);
  });

  it('forces wrap + min-width 0 on attention/invoice content at phone widths', () => {
    const css = read('index.css');
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*overflow-wrap:\s*anywhere/);
    assert.match(css, /exec-attention__main strong/);
    assert.match(css, /exec-outstanding__customer/);
    assert.match(css, /@media \(max-width: 390px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  });

  it('preserves OWNER-001 desktop full-bleed + substantial Live Fleet Map', () => {
    const css = read('index.css');
    const layout = read('styles/layout-grid.css');
    assert.match(layout, /--titan-content-max-width:\s*none/);
    assert.match(
      css,
      /\.exec-dashboard--owner001 \.exec-live-ops-map[\s\S]*clamp\(16rem,\s*28vh,\s*22rem\)/,
    );
    assert.match(css, /exec-dashboard-page--owner001/);
  });

  it('documents supported breakpoints including 360/390/430', () => {
    assert.ok(YG_CUTOVER_001B_MOBILE_BREAKPOINTS.includes(360));
    assert.ok(YG_CUTOVER_001B_MOBILE_BREAKPOINTS.includes(390));
    assert.ok(YG_CUTOVER_001B_MOBILE_BREAKPOINTS.includes(430));
    assert.ok(YG_CUTOVER_001B_MOBILE_BREAKPOINTS.includes(1920));
  });
});

describe('YG-CUTOVER-001B Manager RBAC acceptance', () => {
  it('Manager retains operational admin finance + users:manage without Owner *', () => {
    assert.ok(MANAGER_PERMISSIONS.includes('finance:read'));
    assert.ok(MANAGER_PERMISSIONS.includes('finance:write'));
    assert.ok(MANAGER_PERMISSIONS.includes('users:manage'));
    assert.ok(MANAGER_PERMISSIONS.includes('integrations:manage'));
    assert.ok(MANAGER_PERMISSIONS.includes('security:read'));
    assert.equal(MANAGER_PERMISSIONS.includes('*'), false);
    assert.equal(hasAnyPermission([...MANAGER_PERMISSIONS], ['*']), false);
  });

  it('Manager cannot assign roles; Owner can', () => {
    const manager = { roleName: MANAGER_ROLE_NAME, permissions: [...MANAGER_PERMISSIONS] };
    const owner = { roleName: COMPANY_OWNER_ROLE_NAME, permissions: ['*'] };
    assert.equal(canAssignRoleName(manager, MANAGER_ROLE_NAME).allowed, false);
    assert.equal(canAssignRoleName(owner, MANAGER_ROLE_NAME).allowed, true);
    assert.equal(YG_CUTOVER_001B_MANAGER_RBAC_MATRIX.elevatedToOwner, false);
  });

  it('Manager finance command visibility is permission-gated not Owner-role-gated', () => {
    assert.equal(
      canViewOwnerFinancialCommand({
        roleName: MANAGER_ROLE_NAME,
        permissions: [...MANAGER_PERMISSIONS],
      }),
      true,
    );
    assert.equal(YG_CUTOVER_001B_MANAGER_RBAC_MATRIX.financeVisibility.granted, true);
  });

  it('Google Maps evidence remains rendering-only', () => {
    assert.equal(YG_CUTOVER_001B_GOOGLE_MAPS_EVIDENCE.status, 'rendering_evidence_only');
    assert.equal(YG_CUTOVER_001B_GOOGLE_MAPS_EVIDENCE.authority.fleetGps, 'Cartrack');
  });
});
