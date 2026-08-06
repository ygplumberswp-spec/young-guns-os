import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SECMON_CATEGORIES,
  SECMON_DEFAULT_SETTINGS,
  SECMON_FORBIDDEN_AUTOMATIC_OPERATIONS,
  SECMON_MAX_LOOKBACK_DAYS,
  SECMON_MIN_LOOKBACK_DAYS,
  SECMON_OWNER_ONLY_CATEGORIES,
  SECMON_OWN_ACCOUNT_CATEGORIES,
  SECMON_REDACTED,
  applySecmonSeverityFloor,
  buildSecmonUnavailableSignal,
  buildSecmonWithheldNotice,
  canManageSecmonMonitoring,
  canReadSecmonMonitoring,
  canTriageSecmonSignals,
  canViewSecmonCategory,
  canViewSecmonSensitiveDetail,
  filterSecmonSignalsForScope,
  groupSecmonSignals,
  isSecmonForbiddenAutomaticOperation,
  isSecmonHardDeniedRole,
  isSecmonIncidentOpen,
  isSecmonSecretKey,
  isSecmonSeverityAtLeast,
  maskSecmonEmail,
  maskSecmonIdentifier,
  mustAlwaysSurfaceSecmonSignal,
  normaliseSecmonSettings,
  redactSecmonIp,
  redactSecmonSecretsInText,
  redactSecmonSignalForScope,
  redactSecmonUserAgent,
  resolveSecmonAudienceScope,
  scrubSecmonMetadata,
  secmonAvailabilityFor,
  secmonConfidenceFor,
  secmonSeverityFor,
  sortSecmonSignals,
  summariseSecmonPosture,
  type SecmonCategory,
  type SecmonRawSignal,
  type SecmonSignal,
} from './security-monitoring.js';

function signal(overrides: Partial<SecmonSignal> = {}): SecmonSignal {
  return {
    key: 'failed_authentication:user-1',
    category: 'failed_authentication',
    statementKind: 'fact',
    availability: 'available',
    severity: 'medium',
    confidence: 'medium',
    title: 'Repeated failed sign-ins',
    detail: 'Twelve failed sign-in attempts were recorded.',
    occurrenceCount: 12,
    groupedCount: 12,
    subjectUserId: 'user-1',
    subjectLabel: 'a****@example.com',
    evidence: [
      {
        source: 'security_login_events',
        observationCount: 12,
        firstObservedAt: '2026-07-01T00:00:00.000Z',
        lastObservedAt: '2026-07-02T00:00:00.000Z',
        summary: 'twelve login_failed rows',
      },
    ],
    triage: 'new',
    attributionNote: 'Observed activity only.',
    sensitiveDetailWithheld: false,
    observedAt: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('security monitoring access', () => {
  it('gives the owner the full picture', () => {
    const scope = resolveSecmonAudienceScope({ roleName: 'owner', permissions: [], userId: 'u1' });
    assert.equal(scope, 'owner_full');
    assert.ok(canReadSecmonMonitoring({ roleName: 'owner', userId: 'u1' }));
    assert.ok(canManageSecmonMonitoring({ roleName: 'owner', userId: 'u1' }));
    assert.ok(canViewSecmonSensitiveDetail(scope));
    for (const category of SECMON_CATEGORIES) {
      assert.ok(canViewSecmonCategory(scope, category), `owner should read ${category}`);
    }
  });

  it('denies technicians and clients even with a wildcard permission', () => {
    for (const roleName of [
      'technician',
      'senior_technician',
      'field tech',
      'client',
      'customer',
      'portal_user',
      'driver',
    ]) {
      assert.ok(isSecmonHardDeniedRole(roleName), `${roleName} must be hard denied`);
      const scope = resolveSecmonAudienceScope({ roleName, permissions: ['*'], userId: 'u9' });
      assert.equal(scope, 'denied', `${roleName} must not reach monitoring`);
      assert.equal(canReadSecmonMonitoring({ roleName, permissions: ['*'], userId: 'u9' }), false);
      assert.equal(canManageSecmonMonitoring({ roleName, permissions: ['*'], userId: 'u9' }), false);
      assert.equal(canTriageSecmonSignals({ roleName, permissions: ['*'], userId: 'u9' }), false);
    }
  });

  it('denies an unknown or empty role', () => {
    assert.equal(resolveSecmonAudienceScope({ roleName: null, permissions: ['*'] }), 'denied');
    assert.equal(resolveSecmonAudienceScope({ roleName: '  ', permissions: ['*'] }), 'denied');
  });

  it('gives a security admin monitoring without privileged history', () => {
    const identity = { roleName: 'security', permissions: ['security:read'], userId: 'u2' };
    const scope = resolveSecmonAudienceScope(identity);
    assert.equal(scope, 'security_admin');
    assert.equal(canViewSecmonSensitiveDetail(scope), false);
    assert.equal(canManageSecmonMonitoring(identity), false);
    assert.ok(canTriageSecmonSignals(identity));
    for (const category of SECMON_OWNER_ONLY_CATEGORIES) {
      assert.equal(canViewSecmonCategory(scope, category), false, `${category} is owner only`);
    }
  });

  it('requires security:read before an admin role becomes a security reader', () => {
    const scope = resolveSecmonAudienceScope({
      roleName: 'admin',
      permissions: ['jobs:read'],
      userId: 'u3',
    });
    assert.equal(scope, 'own_account_only');
  });

  it('limits office and marketing staff to their own narrow alerts', () => {
    for (const roleName of ['office', 'office_manager', 'marketing']) {
      const scope = resolveSecmonAudienceScope({ roleName, permissions: ['crm:read'], userId: 'u4' });
      assert.equal(scope, 'own_account_only');
      assert.equal(canTriageSecmonSignals({ roleName, userId: 'u4' }), false);
      for (const category of SECMON_CATEGORIES) {
        const expected = SECMON_OWN_ACCOUNT_CATEGORIES.includes(category);
        assert.equal(canViewSecmonCategory(scope, category), expected, `${roleName}/${category}`);
      }
    }
  });

  it('only shows an own-account user signals about themselves', () => {
    const mine = signal({ key: 'a', subjectUserId: 'u4' });
    const theirs = signal({ key: 'b', subjectUserId: 'u5' });
    const privileged = signal({ key: 'c', category: 'permission_change', subjectUserId: 'u4' });
    const { visible, withheld } = filterSecmonSignalsForScope(
      [mine, theirs, privileged],
      'own_account_only',
      'u4',
    );
    assert.deepEqual(
      visible.map((item) => item.key),
      ['a'],
    );
    assert.ok(withheld.length > 0);
    assert.ok(withheld.every((item) => item.reason.length > 0));
  });

  it('returns nothing at all for a denied scope', () => {
    const { visible, withheld } = filterSecmonSignalsForScope([signal()], 'denied', 'u9');
    assert.deepEqual(visible, []);
    assert.deepEqual(withheld, []);
  });

  it('explains why a category was withheld instead of hiding it silently', () => {
    const notice = buildSecmonWithheldNotice('permission_change', 'security_admin');
    assert.equal(notice.category, 'permission_change');
    assert.match(notice.reason, /Owner access/i);
    assert.ok(notice.label.length > 0);
  });
});

describe('security monitoring redaction', () => {
  it('recognises credential-bearing metadata keys', () => {
    for (const key of [
      'password',
      'apiKey',
      'api_key',
      'API-KEY',
      'clientSecret',
      'refresh_token',
      'Authorization',
      'cookie',
      'refreshTokenHash',
      'webhookSecret',
      'otp',
    ]) {
      assert.ok(isSecmonSecretKey(key), `${key} must be treated as a secret`);
    }
    assert.equal(isSecmonSecretKey('city'), false);
    assert.equal(isSecmonSecretKey('occurredAt'), false);
  });

  it('replaces secret values anywhere in metadata', () => {
    const scrubbed = scrubSecmonMetadata({
      action: 'integration.sync',
      apiKey: 'sk_live_abcdefghijklmnop',
      nested: { refresh_token: 'rt-1234567890', note: 'fine' },
      list: [{ password: 'hunter2' }],
    }) as Record<string, unknown>;

    assert.equal(scrubbed.apiKey, SECMON_REDACTED);
    assert.equal((scrubbed.nested as Record<string, unknown>).refresh_token, SECMON_REDACTED);
    assert.equal((scrubbed.nested as Record<string, unknown>).note, 'fine');
    assert.equal(
      ((scrubbed.list as unknown[])[0] as Record<string, unknown>).password,
      SECMON_REDACTED,
    );
    const serialised = JSON.stringify(scrubbed);
    assert.ok(!serialised.includes('sk_live_abcdefghijklmnop'));
    assert.ok(!serialised.includes('hunter2'));
    assert.ok(!serialised.includes('rt-1234567890'));
  });

  it('coarsens ip addresses, user agents and emails found in metadata', () => {
    const scrubbed = scrubSecmonMetadata({
      ipAddress: '196.25.14.203',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Safari/604.1',
      email: 'accounts@example.co.za',
    }) as Record<string, unknown>;

    assert.equal(scrubbed.ipAddress, '196.25.x.x');
    assert.ok(!String(scrubbed.userAgent).includes('AppleWebKit'));
    assert.equal(scrubbed.email, 'a*******@example.co.za');
  });

  it('does not recurse without bound', () => {
    let deep: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 30; i += 1) deep = { child: deep };
    const scrubbed = scrubSecmonMetadata(deep);
    assert.ok(JSON.stringify(scrubbed).includes(SECMON_REDACTED));
  });

  it('strips credential-shaped substrings out of free text', () => {
    const text = redactSecmonSecretsInText(
      'call failed with Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345 and token eyJhbGciOiJIUzI1NiJ9',
    );
    assert.ok(!text.includes('abcdefghijklmnopqrstuvwxyz012345'));
    assert.ok(!text.includes('eyJhbGciOiJIUzI1NiJ9'));
    assert.ok(text.includes(SECMON_REDACTED));
  });

  it('reduces an ip to a network hint', () => {
    assert.equal(redactSecmonIp('102.132.44.9'), '102.132.x.x');
    assert.equal(redactSecmonIp(null), null);
    assert.equal(redactSecmonIp('   '), null);
    assert.equal(redactSecmonIp('not-an-ip'), SECMON_REDACTED);
    assert.ok(String(redactSecmonIp('2001:0db8:85a3::8a2e')).includes('x'));
  });

  it('reduces a user agent to a device family', () => {
    assert.equal(
      redactSecmonUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/120.0 Safari/537'),
      'Windows / Chrome',
    );
    assert.equal(redactSecmonUserAgent(''), null);
  });

  it('masks identifiers and emails', () => {
    assert.equal(maskSecmonIdentifier('abcdef123456'), '…3456');
    assert.equal(maskSecmonIdentifier('abc'), SECMON_REDACTED);
    assert.equal(maskSecmonEmail('owner@titan.co.za'), 'o****@titan.co.za');
    assert.equal(maskSecmonEmail('no-at-sign'), null);
  });

  it('withholds owner-only detail from a lesser scope', () => {
    const original = signal({ subjectLabel: 'o****@titan.co.za' });
    const forAdmin = redactSecmonSignalForScope(original, 'security_admin');
    assert.equal(forAdmin.sensitiveDetailWithheld, true);
    assert.equal(forAdmin.subjectLabel, null);

    const forOwner = redactSecmonSignalForScope(original, 'owner_full');
    assert.equal(forOwner.sensitiveDetailWithheld, false);
    assert.equal(forOwner.subjectLabel, 'o****@titan.co.za');
  });
});

describe('security monitoring severity and confidence', () => {
  it('treats a cross-tenant attempt as critical on a single observation', () => {
    assert.equal(secmonSeverityFor({ category: 'cross_tenant_attempt', observationCount: 1 }), 'critical');
  });

  it('raises failed sign-in severity with volume and spread', () => {
    assert.equal(secmonSeverityFor({ category: 'failed_authentication', observationCount: 1 }), 'low');
    assert.equal(secmonSeverityFor({ category: 'failed_authentication', observationCount: 5 }), 'medium');
    assert.equal(secmonSeverityFor({ category: 'failed_authentication', observationCount: 25 }), 'high');
    assert.equal(
      secmonSeverityFor({ category: 'failed_authentication', observationCount: 6, distinctSubjects: 4 }),
      'high',
    );
  });

  it('reports info severity when there is nothing to report', () => {
    for (const category of SECMON_CATEGORIES) {
      assert.equal(secmonSeverityFor({ category, observationCount: 0 }), 'info');
    }
  });

  it('needs corroboration and recency before claiming high confidence', () => {
    assert.equal(secmonConfidenceFor({ observationCount: 0, distinctSources: 0, ageHours: 1 }), 'low');
    assert.equal(secmonConfidenceFor({ observationCount: 2, distinctSources: 1, ageHours: 1 }), 'low');
    assert.equal(secmonConfidenceFor({ observationCount: 4, distinctSources: 1, ageHours: 1 }), 'medium');
    assert.equal(secmonConfidenceFor({ observationCount: 12, distinctSources: 1, ageHours: 1 }), 'medium');
    assert.equal(secmonConfidenceFor({ observationCount: 12, distinctSources: 2, ageHours: 4 }), 'high');
    assert.equal(
      secmonConfidenceFor({ observationCount: 40, distinctSources: 3, ageHours: 24 * 60 }),
      'low',
      'stale evidence must not carry high confidence',
    );
  });

  it('reports unavailable or needs review rather than guessing', () => {
    assert.equal(
      secmonAvailabilityFor({ observationCount: 0, category: 'failed_authentication' }),
      'unavailable',
    );
    assert.equal(
      secmonAvailabilityFor({ observationCount: 1, category: 'failed_authentication' }),
      'needs_review',
    );
    assert.equal(
      secmonAvailabilityFor({ observationCount: 6, category: 'failed_authentication' }),
      'available',
    );
    assert.equal(
      secmonAvailabilityFor({ observationCount: 1, category: 'cross_tenant_attempt' }),
      'available',
    );
  });

  it('builds an honest placeholder when evidence is missing', () => {
    const unavailable = buildSecmonUnavailableSignal({ category: 'integration_security' });
    assert.equal(unavailable.availability, 'unavailable');
    assert.equal(unavailable.occurrenceCount, 0);
    assert.equal(unavailable.severity, 'info');
    assert.deepEqual(unavailable.evidence, []);
    assert.equal(unavailable.statementKind, 'fact');

    const review = buildSecmonUnavailableSignal({
      category: 'data_access',
      availability: 'needs_review',
    });
    assert.equal(review.availability, 'needs_review');
  });

  it('orders by severity, then confidence, then weight of evidence', () => {
    const ordered = sortSecmonSignals([
      signal({ key: 'low', severity: 'low' }),
      signal({ key: 'critical', severity: 'critical' }),
      signal({ key: 'high-weak', severity: 'high', confidence: 'low', occurrenceCount: 90 }),
      signal({ key: 'high-strong', severity: 'high', confidence: 'high', occurrenceCount: 4 }),
    ]);
    assert.deepEqual(
      ordered.map((item) => item.key),
      ['critical', 'high-strong', 'high-weak', 'low'],
    );
  });
});

describe('security monitoring grouping', () => {
  it('folds repeated events into one signal without losing the count', () => {
    const raw: SecmonRawSignal[] = Array.from({ length: 14 }, (_, index) => ({
      category: 'failed_authentication' as SecmonCategory,
      groupKey: 'user-1',
      subjectUserId: 'user-1',
      subjectLabel: 'a****@example.com',
      occurredAt: `2026-07-0${(index % 9) + 1}T00:00:00.000Z`,
      source: 'security_login_events' as const,
      summary: 'failed sign-in',
    }));

    const grouped = groupSecmonSignals(raw);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].occurrenceCount, 14);
    assert.equal(grouped[0].distinctSubjects, 1);
    assert.equal(grouped[0].firstObservedAt, '2026-07-01T00:00:00.000Z');
    assert.equal(grouped[0].lastObservedAt, '2026-07-09T00:00:00.000Z');
  });

  it('keeps separate accounts in separate groups and drops a shared subject claim', () => {
    const grouped = groupSecmonSignals([
      {
        category: 'failed_authentication',
        groupKey: 'shared-ip',
        subjectUserId: 'user-1',
        subjectLabel: 'a',
        occurredAt: '2026-07-01T00:00:00.000Z',
        source: 'security_login_events',
        summary: 'failed sign-in',
      },
      {
        category: 'failed_authentication',
        groupKey: 'shared-ip',
        subjectUserId: 'user-2',
        subjectLabel: 'b',
        occurredAt: '2026-07-02T00:00:00.000Z',
        source: 'security_login_events',
        summary: 'failed sign-in',
      },
    ]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].distinctSubjects, 2);
    assert.equal(grouped[0].subjectUserId, null, 'a multi-account group names no single account');
  });

  it('records every source that contributed', () => {
    const grouped = groupSecmonSignals([
      {
        category: 'suspicious_session',
        groupKey: 'session-1',
        subjectUserId: 'user-1',
        subjectLabel: null,
        occurredAt: '2026-07-01T00:00:00.000Z',
        source: 'sessions',
        summary: 'long-lived session',
      },
      {
        category: 'suspicious_session',
        groupKey: 'session-1',
        subjectUserId: 'user-1',
        subjectLabel: null,
        occurredAt: '2026-07-01T01:00:00.000Z',
        source: 'security_login_events',
        summary: 'flagged sign-in',
      },
    ]);
    assert.equal(grouped[0].sources.length, 2);
  });

  it('returns nothing for no input', () => {
    assert.deepEqual(groupSecmonSignals([]), []);
  });
});

describe('security monitoring noise controls', () => {
  it('never suppresses a high or critical signal', () => {
    const { visible, suppressed } = applySecmonSeverityFloor(
      [
        signal({ key: 'critical', severity: 'critical' }),
        signal({ key: 'high', severity: 'high' }),
        signal({ key: 'low', severity: 'low' }),
      ],
      'critical',
    );
    assert.deepEqual(
      visible.map((item) => item.key).sort(),
      ['critical', 'high'],
    );
    assert.deepEqual(
      suppressed.map((item) => item.key),
      ['low'],
    );
    assert.ok(mustAlwaysSurfaceSecmonSignal({ severity: 'high' }));
    assert.equal(mustAlwaysSurfaceSecmonSignal({ severity: 'medium' }), false);
  });

  it('keeps gaps in coverage visible even below the floor', () => {
    const { visible } = applySecmonSeverityFloor(
      [buildSecmonUnavailableSignal({ category: 'data_access' })],
      'critical',
    );
    assert.equal(visible.length, 1);
  });

  it('compares severities in the expected order', () => {
    assert.ok(isSecmonSeverityAtLeast('critical', 'high'));
    assert.ok(isSecmonSeverityAtLeast('high', 'high'));
    assert.equal(isSecmonSeverityAtLeast('medium', 'high'), false);
  });
});

describe('security monitoring safeguards', () => {
  it('lists the operations that may never happen automatically', () => {
    for (const operation of [
      'delete_account',
      'remove_permission',
      'rotate_credential',
      'shut_down_integration',
      'revoke_session',
      'block_ip',
    ]) {
      assert.ok(isSecmonForbiddenAutomaticOperation(operation), `${operation} must stay forbidden`);
    }
    assert.equal(isSecmonForbiddenAutomaticOperation('review_account'), false);
    assert.ok(SECMON_FORBIDDEN_AUTOMATIC_OPERATIONS.length >= 6);
  });

  it('pins the remediation and secret invariants regardless of stored input', () => {
    const settings = normaliseSecmonSettings({
      autoRemediationEnabled: true as unknown as false,
      exposeSecretsEnabled: true as unknown as false,
    });
    assert.equal(settings.autoRemediationEnabled, false);
    assert.equal(settings.exposeSecretsEnabled, false);
    assert.equal(SECMON_DEFAULT_SETTINGS.autoRemediationEnabled, false);
    assert.equal(SECMON_DEFAULT_SETTINGS.exposeSecretsEnabled, false);
  });

  it('clamps settings into a safe range', () => {
    const low = normaliseSecmonSettings({ lookbackDays: -10, failedLoginThreshold: 0 });
    assert.equal(low.lookbackDays, SECMON_MIN_LOOKBACK_DAYS);
    assert.equal(low.failedLoginThreshold, 3);

    const high = normaliseSecmonSettings({ lookbackDays: 9000, failedLoginThreshold: 9000 });
    assert.equal(high.lookbackDays, SECMON_MAX_LOOKBACK_DAYS);
    assert.equal(high.failedLoginThreshold, 100);

    const bad = normaliseSecmonSettings({ severityFloor: 'nonsense' as never });
    assert.equal(bad.severityFloor, SECMON_DEFAULT_SETTINGS.severityFloor);
    assert.deepEqual(normaliseSecmonSettings(null), SECMON_DEFAULT_SETTINGS);
  });

  it('treats an incident as open until it is resolved or closed', () => {
    assert.ok(isSecmonIncidentOpen('open'));
    assert.ok(isSecmonIncidentOpen('investigating'));
    assert.ok(isSecmonIncidentOpen('contained'));
    assert.equal(isSecmonIncidentOpen('resolved'), false);
    assert.equal(isSecmonIncidentOpen('closed'), false);
  });
});

describe('security monitoring posture', () => {
  it('counts only signals that are actually stated', () => {
    const posture = summariseSecmonPosture({
      signals: [
        signal({ severity: 'critical' }),
        signal({ severity: 'high' }),
        signal({ severity: 'critical', availability: 'needs_review' }),
      ],
      openIncidents: 2,
      coverage: [
        { category: 'failed_authentication', label: 'a', availability: 'available', observationCount: 4 },
        { category: 'data_access', label: 'b', availability: 'unavailable', observationCount: 0 },
      ],
    });
    assert.equal(posture.criticalCount, 1);
    assert.equal(posture.highCount, 1);
    assert.equal(posture.openIncidentCount, 2);
    assert.equal(posture.unavailableCategories, 1);
    assert.equal(posture.monitoredCategories, 1);
  });
});
