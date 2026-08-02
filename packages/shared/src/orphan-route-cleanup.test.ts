import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ORPHAN_ROUTE_ENTRIES,
  resolveOrphanRouteCleanup,
} from './orphan-route-cleanup.js';

describe('resolveOrphanRouteCleanup', () => {
  it('retains GO sidebar and deep-link routes', () => {
    assert.equal(resolveOrphanRouteCleanup('/crm').disposition, 'RETAIN_COMPLETE');
    assert.equal(resolveOrphanRouteCleanup('/jobs/abc').disposition, 'RETAIN_COMPLETE');
    assert.equal(resolveOrphanRouteCleanup('/finance/invoices').disposition, 'RETAIN_COMPLETE');
    assert.equal(resolveOrphanRouteCleanup('/global-search').disposition, 'RETAIN_COMPLETE');
    assert.equal(resolveOrphanRouteCleanup('/automation').disposition, 'RETAIN_COMPLETE');
  });

  it('redirects NO-GO enterprise scaffolds', () => {
    const decision = resolveOrphanRouteCleanup('/ai-orchestration');
    assert.equal(decision.disposition, 'HIDE_REDIRECT');
    if ('redirectTo' in decision) {
      assert.equal(decision.redirectTo, '/enterprise-modules');
    }
  });

  it('redirects automation sub-routes but not list hub', () => {
    assert.equal(resolveOrphanRouteCleanup('/automation/new').disposition, 'HIDE_REDIRECT');
    assert.equal(resolveOrphanRouteCleanup('/automation/wf-1').disposition, 'HIDE_REDIRECT');
    assert.equal(resolveOrphanRouteCleanup('/automation').disposition, 'RETAIN_COMPLETE');
  });

  it('removes duplicate aliases via redirect target', () => {
    const devs = resolveOrphanRouteCleanup('/developers');
    assert.equal(devs.disposition, 'REMOVE');
    if ('redirectTo' in devs) {
      assert.equal(devs.redirectTo, '/developer');
    }
    const marketing = resolveOrphanRouteCleanup('/marketing-intelligence');
    assert.equal(marketing.disposition, 'REMOVE');
    if ('redirectTo' in marketing) {
      assert.equal(marketing.redirectTo, '/marketing');
    }
  });

  it('does not hide finance routes', () => {
    for (const path of [
      '/finance/receivables',
      '/finance/payables',
      '/finance/cashflow',
      '/finance/invoices/new',
    ]) {
      assert.equal(resolveOrphanRouteCleanup(path).disposition, 'RETAIN_COMPLETE', path);
    }
  });

  it('covers all 55 NO-GO matrix routes except global-search retain override', () => {
    const nogoPaths = [
      '/ai-orchestration',
      '/app-builder',
      '/asset-equipment',
      '/asset-intelligence',
      '/automation-studio',
      '/automation/wf-1',
      '/automation/executions',
      '/automation/n8n',
      '/automation/new',
      '/business-continuity',
      '/business-evolution',
      '/customer-experience',
      '/data-migration',
      '/digital-twin',
      '/dispatch-intelligence',
      '/document-ai',
      '/documents/categories/new',
      '/documents/job-packs/pack-1',
      '/drafts',
      '/evolution',
      '/financial-planning',
      '/fleet-intelligence',
      '/go-live',
      '/industry-packs',
      '/inventory/movements',
      '/inventory/products/new',
      '/it-operations',
      '/knowledge',
      '/launch-center',
      '/legal-compliance',
      '/marketing-intelligence',
      '/notifications',
      '/operations',
      '/personal-communications-intelligence',
      '/platform',
      '/procurement/parts-requests',
      '/procurement/purchase-orders/po-1',
      '/procurement/purchase-orders/new',
      '/procurement/suppliers/sup-1',
      '/quality',
      '/recruiting',
      '/release',
      '/release-center',
      '/saas-management',
      '/sales-intelligence',
      '/security',
      '/service-delivery',
      '/voice-reception',
      '/developer',
      '/developers',
      '/workforce-intelligence',
      '/workforce/day-timeline',
      '/workforce/manager',
      '/workforce/self-service',
    ];
    for (const path of nogoPaths) {
      const d = resolveOrphanRouteCleanup(path);
      assert.notEqual(d.disposition, 'RETAIN_COMPLETE', `expected cleanup for ${path}`);
    }
    assert.equal(resolveOrphanRouteCleanup('/global-search').disposition, 'RETAIN_COMPLETE');
    assert.equal(ORPHAN_ROUTE_ENTRIES.length, 50);
  });
});
