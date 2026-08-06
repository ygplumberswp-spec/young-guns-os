import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applySnControls,
  buildSnActionDraft,
  buildSnCategoryCoverage,
  buildSnDailyBrief,
  buildSnSummary,
  canAccessSmartNotifications,
  canApproveSnActionDrafts,
  canEscalateSnSignal,
  canManageSnSettings,
  canViewSnCategory,
  classifySnModuleSource,
  classifySnNotificationType,
  defaultSnCategoryControl,
  defaultSnCategoryControls,
  defaultSnSettings,
  groupSnSignals,
  isValidSnSnoozeMinutes,
  listVisibleSnCategories,
  normaliseSnTitle,
  resolveSnAudienceScope,
  SN_MAX_SNOOZE_MINUTES,
  SN_OWNER_ONLY_CATEGORIES,
  SN_PRODUCT_COPY,
  snEventKindForAction,
  snGroupKey,
  snPriorityScore,
  snSeverityForAlertLevel,
  snSeverityForNotificationType,
  snStatusForAction,
  snUrgencyFor,
  sortSnGroups,
  type SnCategory,
  type SnRawSignal,
  type SnSignalGroup,
} from './smart-notification-intelligence.js';

const NOW = new Date('2026-08-03T12:00:00.000Z');

function raw(partial: Partial<SnRawSignal> & { sourceId: string }): SnRawSignal {
  return {
    kind: 'notification',
    category: 'operations',
    severity: 'low',
    title: 'Something happened',
    body: 'Detail',
    entityType: null,
    entityId: null,
    occurredAt: NOW.toISOString(),
    unread: false,
    recipientUserId: null,
    ...partial,
  };
}

function group(partial: Partial<SnSignalGroup> & { groupKey: string }): SnSignalGroup {
  return {
    category: 'operations',
    severity: 'medium',
    urgency: 'this_week',
    priorityScore: 300,
    title: 'Signal',
    detail: 'Detail',
    entityType: null,
    entityId: null,
    eventCount: 1,
    duplicateCount: 0,
    unreadCount: 0,
    firstSeenAt: NOW.toISOString(),
    lastSeenAt: NOW.toISOString(),
    status: 'open',
    snoozedUntil: null,
    sources: [],
    autoResolved: false,
    ...partial,
  };
}

describe('smart notification intelligence — access', () => {
  it('grants a feed to any signed-in role but scopes what it contains', () => {
    assert.equal(canAccessSmartNotifications({ roleName: 'Company Owner' }), true);
    assert.equal(canAccessSmartNotifications({ roleName: 'Technician' }), true);
    assert.equal(canAccessSmartNotifications({ roleName: 'Client' }), true);
    assert.equal(canAccessSmartNotifications({ roleName: '' }), false);
    assert.equal(canAccessSmartNotifications({ roleName: null }), false);
  });

  it('scopes technicians to own work and clients to own records regardless of permissions', () => {
    assert.equal(
      resolveSnAudienceScope({ roleName: 'Technician', permissions: ['*', 'notifications:manage'] }),
      'own_work_only',
    );
    assert.equal(
      resolveSnAudienceScope({ roleName: 'Client', permissions: ['*'] }),
      'own_records_only',
    );
    assert.equal(resolveSnAudienceScope({ roleName: 'Company Owner', permissions: [] }), 'company_wide');
    assert.equal(
      resolveSnAudienceScope({ roleName: 'Office Staff', permissions: ['notifications:read'] }),
      'company_wide',
    );
    // Staff without a notification permission stay on their own work.
    assert.equal(resolveSnAudienceScope({ roleName: 'Office Staff', permissions: [] }), 'own_work_only');
  });

  it('keeps sensitive finance, payroll and security categories Owner only', () => {
    for (const category of SN_OWNER_ONLY_CATEGORIES) {
      assert.equal(canViewSnCategory({ roleName: 'Company Owner', permissions: [] }, category), true);
      assert.equal(
        canViewSnCategory({ roleName: 'Manager', permissions: ['*', 'notifications:manage'] }, category),
        false,
        `${category} must not be revealed by permission breadth`,
      );
      assert.equal(canViewSnCategory({ roleName: 'Technician', permissions: ['*'] }, category), false);
      assert.equal(canViewSnCategory({ roleName: 'Client', permissions: ['*'] }, category), false);
    }
  });

  it('limits clients to their own bookings, quotes, invoices and documents', () => {
    const client = { roleName: 'Client', permissions: [] };
    const visible = listVisibleSnCategories(client);
    assert.deepEqual(visible.sort(), [
      'approval',
      'compliance_document',
      'customer_followup',
      'operations',
    ] as SnCategory[]);
    assert.equal(canViewSnCategory(client, 'job_delay'), false);
    assert.equal(canViewSnCategory(client, 'marketing_opportunity'), false);
  });

  it('reserves escalation, settings and approvals appropriately', () => {
    assert.equal(canEscalateSnSignal({ roleName: 'Technician', permissions: ['*'] }), false);
    assert.equal(canEscalateSnSignal({ roleName: 'Client', permissions: ['*'] }), false);
    assert.equal(
      canEscalateSnSignal({ roleName: 'Office Staff', permissions: ['notifications:read'] }),
      true,
    );
    assert.equal(canManageSnSettings({ roleName: 'Manager', permissions: ['*'] }), false);
    assert.equal(canManageSnSettings({ roleName: 'Company Owner', permissions: [] }), true);
    assert.equal(canApproveSnActionDrafts({ roleName: 'Office Staff', permissions: ['*'] }), false);
    assert.equal(canApproveSnActionDrafts({ roleName: 'Platform Owner', permissions: [] }), true);
  });
});

describe('smart notification intelligence — classification', () => {
  it('maps real notification types onto fixed categories and severities', () => {
    assert.equal(classifySnNotificationType('security_alert'), 'security');
    assert.equal(classifySnNotificationType('approval_request'), 'approval');
    assert.equal(classifySnNotificationType('invoice_reminder'), 'overdue_invoice');
    assert.equal(classifySnNotificationType('dispatch_alert'), 'job_delay');
    assert.equal(classifySnNotificationType('inventory_request'), 'stock_procurement');
    assert.equal(classifySnNotificationType('fleet_alert'), 'fleet_vehicle');
    assert.equal(classifySnNotificationType('missed_call_alert'), 'customer_followup');
    // An unmapped type falls back to general operations rather than guessing.
    assert.equal(classifySnNotificationType('something_new'), 'operations');

    assert.equal(snSeverityForNotificationType('security_alert'), 'critical');
    assert.equal(snSeverityForNotificationType('approval_request'), 'high');
    assert.equal(snSeverityForNotificationType('company_announcement'), 'info');
  });

  it('maps notification centre module sources and alert levels', () => {
    assert.equal(classifySnModuleSource('finance'), 'finance');
    assert.equal(classifySnModuleSource('document_ai'), 'compliance_document');
    assert.equal(classifySnModuleSource('procurement'), 'stock_procurement');
    assert.equal(classifySnModuleSource(null), 'operations');
    assert.equal(snSeverityForAlertLevel('emergency'), 'critical');
    assert.equal(snSeverityForAlertLevel('warning'), 'medium');
    assert.equal(snSeverityForAlertLevel('info'), 'info');
  });

  it('raises urgency with age only for already-severe signals', () => {
    assert.equal(snUrgencyFor('critical', 0), 'immediate');
    assert.equal(snUrgencyFor('high', 1), 'today');
    assert.equal(snUrgencyFor('high', 48), 'immediate');
    assert.equal(snUrgencyFor('medium', 1), 'this_week');
    assert.equal(snUrgencyFor('medium', 100), 'today');
    assert.equal(snUrgencyFor('low', 10_000), 'when_convenient');
  });
});

describe('smart notification intelligence — grouping and noise reduction', () => {
  it('builds a stable key per real-world event', () => {
    const a = snGroupKey({ category: 'job_delay', entityType: 'job', entityId: 'ABC', title: 'x' });
    const b = snGroupKey({ category: 'job_delay', entityType: 'Job', entityId: 'abc', title: 'y' });
    assert.equal(a, b, 'same entity must share a key regardless of title or casing');

    const t1 = snGroupKey({ category: 'risk', entityType: null, entityId: null, title: 'Job 41 late' });
    const t2 = snGroupKey({ category: 'risk', entityType: null, entityId: null, title: 'Job 87 late' });
    assert.equal(t1, t2, 'numbers must not split otherwise identical messages');
  });

  it('normalises titles without collapsing genuinely different messages', () => {
    assert.equal(normaliseSnTitle('Invoice #1042 is overdue!'), 'invoice is overdue');
    assert.notEqual(normaliseSnTitle('Invoice overdue'), normaliseSnTitle('Vehicle overdue'));
  });

  it('collapses duplicates into one signal and keeps every row as evidence', () => {
    const rows = [
      raw({ sourceId: '1', category: 'job_delay', entityType: 'job', entityId: 'j1', severity: 'medium', occurredAt: '2026-08-03T08:00:00.000Z' }),
      raw({ sourceId: '2', category: 'job_delay', entityType: 'job', entityId: 'j1', severity: 'high', occurredAt: '2026-08-03T09:00:00.000Z', unread: true, title: 'Newest headline' }),
      raw({ sourceId: '3', category: 'job_delay', entityType: 'job', entityId: 'j1', severity: 'low', occurredAt: '2026-08-03T07:00:00.000Z' }),
    ];
    const [grouped] = groupSnSignals(rows, { now: NOW });
    assert.ok(grouped);
    assert.equal(grouped.eventCount, 3);
    assert.equal(grouped.duplicateCount, 2);
    assert.equal(grouped.unreadCount, 1);
    assert.equal(grouped.sources.length, 3, 'no row is discarded');
    assert.equal(grouped.severity, 'high', 'group carries the worst severity reported');
    assert.equal(grouped.title, 'Newest headline', 'newest row wins the headline');
    assert.equal(grouped.firstSeenAt, '2026-08-03T07:00:00.000Z');
    assert.equal(grouped.lastSeenAt, '2026-08-03T09:00:00.000Z');
    assert.equal(grouped.autoResolved, false);
  });

  it('keeps unrelated events apart', () => {
    const grouped = groupSnSignals(
      [
        raw({ sourceId: '1', category: 'job_delay', entityType: 'job', entityId: 'j1' }),
        raw({ sourceId: '2', category: 'job_delay', entityType: 'job', entityId: 'j2' }),
        raw({ sourceId: '3', category: 'security', title: 'Failed sign-in' }),
      ],
      { now: NOW },
    );
    assert.equal(grouped.length, 3);
  });

  it('orders severe, urgent and repeated signals above quiet ones', () => {
    const critical = snPriorityScore({ severity: 'critical', urgency: 'immediate', duplicateCount: 0, unreadCount: 0 });
    const highRepeated = snPriorityScore({ severity: 'high', urgency: 'immediate', duplicateCount: 9, unreadCount: 1 });
    const lowQuiet = snPriorityScore({ severity: 'low', urgency: 'when_convenient', duplicateCount: 0, unreadCount: 0 });
    assert.ok(critical > highRepeated, 'severity dominates repetition');
    assert.ok(highRepeated > lowQuiet);

    const sorted = sortSnGroups([
      group({ groupKey: 'a', priorityScore: 120 }),
      group({ groupKey: 'b', priorityScore: 540 }),
      group({ groupKey: 'c', priorityScore: 300 }),
    ]);
    assert.deepEqual(sorted.map((g) => g.groupKey), ['b', 'c', 'a']);
  });
});

describe('smart notification intelligence — Owner controls', () => {
  const settings = defaultSnSettings();
  const controls = defaultSnCategoryControls();

  it('opens quiet: general operations is held for the digest by default', () => {
    const control = defaultSnCategoryControl('operations');
    assert.equal(control.digestOnly, true);
    assert.equal(control.minSeverity, 'medium');
    assert.equal(defaultSnCategoryControl('security').ownerOnly, true);
    assert.equal(defaultSnCategoryControl('job_delay').ownerOnly, false);
  });

  it('never suppresses silently — every held signal carries a reason', () => {
    const result = applySnControls(
      [
        group({ groupKey: 'disabled', category: 'risk', severity: 'high' }),
        group({ groupKey: 'tooQuiet', category: 'job_delay', severity: 'info' }),
        group({ groupKey: 'belowCategoryBar', category: 'job_delay', severity: 'medium' }),
        group({ groupKey: 'shown', category: 'job_delay', severity: 'high' }),
      ],
      {
        settings,
        controls: controls.map((c) => {
          if (c.category === 'risk') return { ...c, enabled: false };
          if (c.category === 'job_delay') return { ...c, minSeverity: 'high' as const };
          return c;
        }),
        now: NOW,
      },
    );
    assert.deepEqual(result.feed.map((g) => g.groupKey), ['shown']);
    const reasons = new Map(result.suppressed.map((s) => [s.groupKey, s.reason]));
    assert.equal(reasons.get('disabled'), 'category_disabled');
    // The global floor is checked before the per-category bar.
    assert.equal(reasons.get('tooQuiet'), 'below_global_threshold');
    assert.equal(reasons.get('belowCategoryBar'), 'below_category_threshold');
    for (const held of result.suppressed) {
      assert.ok(held.explanation.length > 0, 'a held signal must explain itself');
    }
  });

  it('honours snooze until it expires and keeps dismissed signals out of the feed', () => {
    const result = applySnControls(
      [
        group({
          groupKey: 'snoozed',
          category: 'job_delay',
          severity: 'high',
          status: 'snoozed',
          snoozedUntil: '2026-08-03T18:00:00.000Z',
        }),
        group({
          groupKey: 'expired',
          category: 'job_delay',
          severity: 'high',
          status: 'snoozed',
          snoozedUntil: '2026-08-03T06:00:00.000Z',
        }),
        group({ groupKey: 'dismissed', category: 'job_delay', severity: 'high', status: 'dismissed' }),
      ],
      { settings, controls, now: NOW },
    );
    assert.deepEqual(result.feed.map((g) => g.groupKey), ['expired']);
    const reasons = new Map(result.suppressed.map((s) => [s.groupKey, s.reason]));
    assert.equal(reasons.get('snoozed'), 'snoozed');
    assert.equal(reasons.get('dismissed'), 'dismissed');
  });

  it('never lets a digest preference hide a critical or escalated signal', () => {
    const result = applySnControls(
      [
        group({ groupKey: 'critical', category: 'operations', severity: 'critical' }),
        group({ groupKey: 'escalated', category: 'operations', severity: 'medium', status: 'escalated' }),
        group({ groupKey: 'routine', category: 'operations', severity: 'medium' }),
      ],
      { settings, controls, now: NOW },
    );
    assert.deepEqual(result.feed.map((g) => g.groupKey).sort(), ['critical', 'escalated']);
    assert.deepEqual(result.digest.map((g) => g.groupKey), ['routine']);
  });

  it('caps the live feed so the Owner is never flooded', () => {
    const many = Array.from({ length: 8 }, (_unused, index) =>
      group({ groupKey: `g${index}`, category: 'job_delay', severity: 'high' }),
    );
    const result = applySnControls(many, {
      settings: { ...settings, maxFeedItems: 3 },
      controls,
      now: NOW,
    });
    assert.equal(result.feed.length, 3);
    assert.equal(result.digest.length, 5);
    assert.ok(result.suppressed.every((s) => s.reason === 'feed_limit'));
  });

  it('bounds snooze so a signal can be deferred but not buried', () => {
    assert.equal(isValidSnSnoozeMinutes(60), true);
    assert.equal(isValidSnSnoozeMinutes(1), false);
    assert.equal(isValidSnSnoozeMinutes(SN_MAX_SNOOZE_MINUTES + 1), false);
    assert.equal(isValidSnSnoozeMinutes(30.5), false);
  });

  it('maps actions onto states and audit events', () => {
    assert.equal(snStatusForAction('acknowledge'), 'acknowledged');
    assert.equal(snStatusForAction('escalate'), 'escalated');
    assert.equal(snStatusForAction('reopen'), 'open');
    assert.equal(snEventKindForAction('dismiss'), 'dismissed');
    assert.equal(snEventKindForAction('reopen'), 'reopened');
  });
});

describe('smart notification intelligence — evidence honesty', () => {
  it('reports a category with no rows as unavailable rather than clean', () => {
    const coverage = buildSnCategoryCoverage({
      categories: ['marketing_opportunity', 'security', 'risk'],
      counts: new Map<SnCategory, number>([['security', 4]]),
      controls: defaultSnCategoryControls().map((c) =>
        c.category === 'risk' ? { ...c, enabled: false } : c,
      ),
    });
    const byCategory = new Map(coverage.map((c) => [c.category, c]));
    assert.equal(byCategory.get('marketing_opportunity')?.availability, 'unavailable');
    assert.match(byCategory.get('marketing_opportunity')?.rationale ?? '', /No signal is invented/);
    assert.equal(byCategory.get('security')?.availability, 'available');
    assert.equal(byCategory.get('risk')?.availability, 'needs_review');
  });

  it('does not invent a daily brief when there is nothing to report', () => {
    const brief = buildSnDailyBrief({
      settings: defaultSnSettings(),
      feed: [],
      digest: [],
      suppressedCount: 0,
      totalSourceRows: 0,
    });
    assert.equal(brief.availability, 'unavailable');
    assert.equal(brief.lines.length, 0);
    assert.equal(brief.autoActioned, false);
    assert.match(brief.summary, /nothing to brief on/);
  });

  it('summarises real rows and respects the Owner brief limit', () => {
    const feed = Array.from({ length: 6 }, (_unused, index) =>
      group({
        groupKey: `g${index}`,
        category: index === 0 ? 'approval' : 'job_delay',
        severity: index === 1 ? 'critical' : 'medium',
        priorityScore: 500 - index,
        duplicateCount: 1,
      }),
    );
    const brief = buildSnDailyBrief({
      settings: defaultSnSettings({ maxBriefItems: 3 }),
      feed,
      digest: [],
      suppressedCount: 2,
      totalSourceRows: 12,
    });
    assert.equal(brief.lines.length, 3);
    assert.equal(brief.criticalCount, 1);
    assert.equal(brief.approvalCount, 1);
    assert.match(brief.summary, /12 real row\(s\)/);
    assert.match(brief.summary, /6 duplicate row\(s\) grouped/);
    assert.match(brief.summary, /2 held back by Owner controls/);
  });

  it('reports the empty state honestly in the dashboard summary', () => {
    assert.match(
      buildSnSummary({
        feedCount: 0,
        suppressedCount: 0,
        criticalCount: 0,
        groupedRowCount: 0,
        totalSourceRows: 0,
      }),
      /no signal is invented/,
    );
    assert.match(
      buildSnSummary({
        feedCount: 2,
        suppressedCount: 1,
        criticalCount: 1,
        groupedRowCount: 3,
        totalSourceRows: 9,
      }),
      /6 duplicate row\(s\) grouped away/,
    );
  });
});

describe('smart notification intelligence — safeguards', () => {
  it('states the product boundary against the surfaces it reads', () => {
    assert.match(SN_PRODUCT_COPY.notificationsInbox, /rather than replacing them/);
    assert.match(SN_PRODUCT_COPY.notificationCentre, /rather than rebuilding delivery/);
    assert.match(SN_PRODUCT_COPY.thisLayer, /Real rows only/);
  });

  it('frames every action draft as a recommendation that changes nothing downstream', () => {
    const draft = buildSnActionDraft({
      categoryLabel: 'Overdue invoices',
      title: '3 invoices past due',
      detail: 'Counted from real invoice reminder rows.',
      eventCount: 3,
    });
    assert.match(draft.title, /^Overdue invoices — /);
    assert.match(draft.body, /Recommendation only/);
    assert.match(draft.body, /never releases a payment, runs payroll, publishes content or changes permissions/);
    assert.match(draft.body, /No figure or event is invented/);
  });

  it('keeps the automation invariants off in default settings', () => {
    const settings = defaultSnSettings();
    assert.equal(settings.autoActionsEnabled, false);
    assert.equal(settings.inventSignalsEnabled, false);
    assert.equal(settings.groupDuplicatesEnabled, true);
  });
});
