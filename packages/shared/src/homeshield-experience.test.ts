import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHsCustomerLifetimeValueSnapshot,
  buildHsCustomerValueInsightDraft,
  buildHsMaintenanceOpportunityDraft,
  buildHsMembershipSnapshot,
  buildHsOutreachDraft,
  buildHsRenewalOpportunityDraft,
  buildHsRetentionInsightDraft,
  buildHsRetentionSnapshot,
  canAccessHomeshieldExperience,
  canApproveHomeshieldActions,
  canManageHomeshieldSettings,
  canWriteHomeshieldExperience,
  defaultHsSettings,
  HOMESHIELD_GUARANTEES,
  HOMESHIELD_PRODUCT_COPY,
  listHsConnections,
} from './homeshield-experience.js';

describe('homeshield experience foundation', () => {
  it('RBAC: Technician/Client denied; write needs customers/portal/finance write; Owner approves', () => {
    assert.equal(
      canAccessHomeshieldExperience({ roleName: 'Manager', permissions: ['customers:read'] }),
      true,
    );
    assert.equal(
      canAccessHomeshieldExperience({
        roleName: 'Technician',
        permissions: ['*', 'customers:write'],
      }),
      false,
    );
    assert.equal(
      canAccessHomeshieldExperience({ roleName: 'Client', permissions: ['customers:read'] }),
      false,
    );
    assert.equal(
      canWriteHomeshieldExperience({ roleName: 'Manager', permissions: ['customers:read'] }),
      false,
    );
    assert.equal(
      canWriteHomeshieldExperience({ roleName: 'Manager', permissions: ['customers:write'] }),
      true,
    );
    assert.equal(
      canApproveHomeshieldActions({
        roleName: 'Company Owner',
        permissions: ['customers:write'],
      }),
      true,
    );
    assert.equal(
      canApproveHomeshieldActions({ roleName: 'Manager', permissions: ['customers:write'] }),
      false,
    );
    assert.equal(
      canManageHomeshieldSettings({ roleName: 'Company Owner', permissions: ['*'] }),
      true,
    );
  });

  it('membership snapshot stays unavailable without real plans/subscriptions — never invents', () => {
    const empty = buildHsMembershipSnapshot({ planCount: 0, activeSubscriptionCount: 0 });
    assert.equal(empty.availability, 'unavailable');
    assert.ok(/not invented/i.test(empty.rationale));
    const available = buildHsMembershipSnapshot({ planCount: 2, activeSubscriptionCount: 1 });
    assert.equal(available.availability, 'available');
    assert.equal(available.activeSubscriptionCount, 1);
  });

  it('renewal and outreach drafts are drafts only — never auto-bill language as execution', () => {
    const renewal = buildHsRenewalOpportunityDraft({
      customerName: 'Acme',
      planName: 'HomeShield Plus',
      renewsAt: '2026-09-01T00:00:00.000Z',
      daysUntilRenewal: 14,
    });
    assert.ok(/draft|not a charge|Owner approval/i.test(renewal.body));
    const outreach = buildHsOutreachDraft({ customerName: 'Acme' });
    assert.ok(/will not send until approved/i.test(outreach.body));
  });

  it('customer lifetime value stays unavailable without stored CLV — never invents', () => {
    const empty = buildHsCustomerLifetimeValueSnapshot({
      activeSubscriptionCount: 0,
      pricedPlanCount: 0,
      maintenanceRunCount: 0,
    });
    assert.equal(empty.availability, 'unavailable');
    assert.equal(empty.estimatedValueCents, null);
    assert.ok(/not invented|unavailable/i.test(empty.rationale));
    const signalsOnly = buildHsCustomerLifetimeValueSnapshot({
      activeSubscriptionCount: 2,
      pricedPlanCount: 1,
      maintenanceRunCount: 3,
    });
    assert.equal(signalsOnly.availability, 'unavailable');
    assert.equal(signalsOnly.estimatedValueCents, null);
    assert.ok(/not invented/i.test(signalsOnly.rationale));
    const stored = buildHsCustomerLifetimeValueSnapshot({
      activeSubscriptionCount: 1,
      pricedPlanCount: 1,
      maintenanceRunCount: 2,
      storedValueCents: 120000,
      currency: 'ZAR',
    });
    assert.equal(stored.availability, 'available');
    assert.equal(stored.estimatedValueCents, 120000);
  });

  it('retention and customer value drafts stay honest — never invent CLV/churn', () => {
    const empty = buildHsRetentionSnapshot({
      atRiskSubscriptionCount: 0,
      pausedOrExpiredCount: 0,
      upcomingRenewalCount: 0,
    });
    assert.equal(empty.availability, 'unavailable');
    assert.ok(/not invented/i.test(empty.rationale));
    const value = buildHsCustomerValueInsightDraft({
      customerName: 'Acme',
      planName: 'HomeShield Plus',
      subscriptionStatus: 'active',
      maintenanceRunCount: 2,
      renewsAt: '2026-09-01T00:00:00.000Z',
    });
    assert.ok(/draft|not a CLV|Owner approval/i.test(value.body));
    const maint = buildHsMaintenanceOpportunityDraft({
      customerName: 'Acme',
      planName: 'Geyser service',
      nextDueAt: '2026-08-20T00:00:00.000Z',
      plumbingKind: 'geyser',
    });
    assert.ok(/not invented|Owner approval/i.test(maint.body));
    const retention = buildHsRetentionInsightDraft({
      customerName: 'Acme',
      planName: 'HomeShield Plus',
      subscriptionStatus: 'paused',
      reason: 'paused membership',
    });
    assert.ok(/draft|not an automatic/i.test(retention.body));
  });

  it('guarantees and settings lock auto-billing off', () => {
    assert.equal(HOMESHIELD_GUARANTEES.noAutomaticBilling, true);
    assert.equal(HOMESHIELD_GUARANTEES.autoBillingEnabled, false);
    assert.equal(HOMESHIELD_GUARANTEES.autoCharge, false);
    const settings = defaultHsSettings();
    assert.equal(settings.autoBillingEnabled, false);
    assert.equal(settings.autoChargeEnabled, false);
    assert.ok(HOMESHIELD_PRODUCT_COPY.billing.includes('No automatic billing'));
    assert.ok(listHsConnections().some((c) => c.key === 'recurring_maintenance'));
  });
});
