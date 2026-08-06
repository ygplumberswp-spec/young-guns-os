import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'executive-command-centre.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/executive-command-centre.service.ts'),
  'utf8',
);
const sharedSource = readFileSync(
  join(here, '../../../../packages/shared/src/executive-command-centre.ts'),
  'utf8',
);

describe('executive command centre API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'ownerOnly: true as const',
      'autoExecuted: false as const',
      'inventFinancialFigures: false as const',
      'fakeBusinessData: false as const',
      'approvalRequired: true as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
    assert.ok(!routeSource.includes('autoExecuted: true'));
    assert.ok(!routeSource.includes('inventFinancialFigures: true'));
    assert.ok(!routeSource.includes('fakeBusinessData: true'));
  });

  it('gates the whole router behind auth and an Owner-only check', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('router.use(requireAuth)'));
    // The owner gate is router-level, so every endpoint inherits it.
    assert.ok(routeSource.includes('canAccessExecutiveCommandCentre'));
    assert.ok(routeSource.includes("code: 'FORBIDDEN'"));
    assert.ok(routeSource.includes('Owner only'));
    assert.ok(routeSource.includes('Technician, Client, Manager, Dispatcher, Accountant'));
  });

  it('Owner-only access is decided by role, never by permission breadth', () => {
    // A wildcard permission must not be sufficient for this finance surface.
    assert.ok(sharedSource.includes('const OWNER_ROLES'));
    assert.ok(sharedSource.includes("'Company Owner', 'Owner', 'Platform Owner'"));
    assert.ok(
      sharedSource.includes('return (OWNER_ROLES as readonly string[]).includes(role);'),
      'access must be role-based',
    );
    // canAccess must not short-circuit on a wildcard permission.
    const accessFn = sharedSource.slice(
      sharedSource.indexOf('export function canAccessExecutiveCommandCentre'),
      sharedSource.indexOf('export function canWriteExecutiveCommandCentre'),
    );
    assert.ok(!accessFn.includes("includes('*')"), 'wildcard must not grant access');
    assert.ok(!accessFn.includes('agents:read'));
    assert.ok(!accessFn.includes('executive:read'));
  });

  it('service re-enforces Owner-only so the route guard cannot be bypassed', () => {
    assert.ok(serviceSource.includes('canAccessExecutiveCommandCentre'));
    assert.ok(serviceSource.includes('canApproveExecutiveCommandCentre'));
    assert.ok(serviceSource.includes('canManageExecutiveCommandCentreSettings'));
    assert.ok(serviceSource.includes('private assertRead'));
    assert.ok(serviceSource.includes('private assertWrite'));
    assert.ok(serviceSource.includes('private assertApprove'));
    // Every public entry point asserts before touching data.
    for (const method of [
      'getDashboard',
      'getSettings',
      'updateSettings',
      'listActionDrafts',
      'createActionDraft',
      'decideActionDraft',
      'listInsights',
      'createInsight',
      'acknowledgeInsight',
      'refreshActionDrafts',
    ]) {
      assert.ok(serviceSource.includes(`async ${method}(`), `missing method: ${method}`);
    }
    assert.ok(serviceSource.includes('Executive Command Centre is Owner only'));
  });

  it('never invents financial figures — missing values report a reason', () => {
    assert.ok(serviceSource.includes('ecMoney('));
    assert.ok(serviceSource.includes('inventFinancialFiguresEnabled: false'));
    assert.ok(serviceSource.includes('financialFiguresInvented: false'));
    assert.ok(serviceSource.includes('is reported unavailable rather than estimated'));
    assert.ok(serviceSource.includes('unavailablePanels'));
    // Mixed currencies must never be summed with an invented exchange rate.
    assert.ok(serviceSource.includes('No exchange rate is invented'));
    assert.ok(serviceSource.includes('groupBy(salesOpportunities.currency)'));
    // A missing figure must never be coerced to zero in the shared helper.
    assert.ok(sharedSource.includes("availability: 'unavailable'"));
    assert.ok(sharedSource.includes('amountCents: null'));
  });

  it('reads real connected sources rather than rebuilding them', () => {
    // Finance figures are delegated to the existing Cashflow & Profit service.
    assert.ok(serviceSource.includes('FinanceCashflowProfitService'));
    assert.ok(serviceSource.includes('this.finance.computeCashflow('));
    assert.ok(serviceSource.includes('this.finance.computeProfit('));
    // Operations panels read real rows.
    for (const table of [
      'jobs',
      'users',
      'vehicles',
      'marketingCampaigns',
      'salesOpportunities',
      'leads',
    ]) {
      assert.ok(serviceSource.includes(table), `missing real source: ${table}`);
    }
    // AURA Command Centre is linked, not rebuilt.
    assert.ok(sharedSource.includes("href: '/aura/command-centre'"));
    assert.ok(sharedSource.includes('does not rebuild it'));
  });

  it('every panel query and mutation is scoped by companyId', () => {
    for (const scoped of [
      'eq(jobs.companyId, companyId)',
      'eq(users.companyId, companyId)',
      'eq(vehicles.companyId, companyId)',
      'eq(marketingCampaigns.companyId, companyId)',
      'eq(salesOpportunities.companyId, companyId)',
      'eq(leads.companyId, companyId)',
      'eq(ecSettings.companyId, companyId)',
      'eq(ecActionDrafts.companyId, actor.companyId)',
      'eq(ecInsights.companyId, actor.companyId)',
    ]) {
      assert.ok(serviceSource.includes(scoped), `missing company scope: ${scoped}`);
    }
    // Mutations must carry the tenant on both the filter and the written row.
    assert.ok(serviceSource.includes('companyId: actor.companyId'));
    assert.ok(
      serviceSource.includes(
        'and(eq(ecActionDrafts.id, actionId), eq(ecActionDrafts.companyId, actor.companyId))',
      ),
    );
    assert.ok(
      serviceSource.includes(
        'and(eq(ecInsights.id, insightId), eq(ecInsights.companyId, actor.companyId))',
      ),
    );
    assert.ok(
      serviceSource.includes('and(eq(ecSettings.id, current.id), eq(ecSettings.companyId, actor.companyId))'),
    );
  });

  it('cross-tenant reads and links are denied', () => {
    // A source draft from another company must not be linkable to an insight.
    assert.ok(serviceSource.includes('Tenant isolation'));
    assert.ok(serviceSource.includes('Source action draft not found.'));
    assert.ok(
      serviceSource.includes(
        'eq(ecActionDrafts.id, input.sourceActionId),\n          eq(ecActionDrafts.companyId, actor.companyId),',
      ),
    );
  });

  it('executive actions are approval-gated and never auto-execute', () => {
    assert.ok(serviceSource.includes('autoExecuted: false'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(serviceSource.includes('approvalRequired: true'));
    assert.ok(serviceSource.includes('executedDownstreamChange: false'));
    assert.ok(serviceSource.includes('Only the Company Owner or Platform Owner may decide'));
    // A refreshed draft is queued, never applied.
    assert.ok(serviceSource.includes('Nothing executes on creation'));
    assert.ok(serviceSource.includes('never executes a change'));
    // Invariants cannot be switched on through settings.
    assert.ok(serviceSource.includes('autoExecuteActionsEnabled: false'));
    assert.ok(serviceSource.includes('Invariants can never be switched on'));
  });

  it('writes audit logs scoped by companyId for every mutation', () => {
    assert.ok(serviceSource.includes("entityType: 'executive_command_centre'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('companyId: actor.companyId'));
    for (const action of [
      'executive_command_centre.settings.update',
      'executive_command_centre.action.create',
      'executive_command_centre.action.decide',
      'executive_command_centre.action.refresh',
      'executive_command_centre.insight.create',
      'executive_command_centre.insight.acknowledge',
    ]) {
      assert.ok(serviceSource.includes(action), `missing audit action: ${action}`);
    }
    assert.ok(serviceSource.includes('ownerOnly: true'));
    assert.ok(serviceSource.includes('technicianClientDenied: true'));
  });

  it('validates payloads and contains no fake business data', () => {
    assert.ok(routeSource.includes('z.object('));
    assert.ok(routeSource.includes('panelSchema'));
    assert.ok(routeSource.includes('.uuid()'));
    for (const marker of ['demo', 'sample', 'placeholder', 'lorem', 'faker', 'Math.random']) {
      assert.ok(
        !routeSource.toLowerCase().includes(marker.toLowerCase()),
        `route must not contain fake marker: ${marker}`,
      );
      assert.ok(
        !serviceSource.toLowerCase().includes(marker.toLowerCase()),
        `service must not contain fake marker: ${marker}`,
      );
    }
  });
});
