import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFacebookAttributionChain,
  buildFacebookDashboardCard,
  buildFacebookIdempotencyKey,
  buildFacebookInsightCoverage,
  buildFacebookNotificationDedupeKey,
  canAccessFacebookBusiness,
  canApproveFacebookContent,
  canManageFacebookConnection,
  canTransitionFacebookContent,
  canTransitionFacebookLeadStage,
  canWorkFacebookLeads,
  canWriteFacebookBusiness,
  checkFacebookBrandCompliance,
  classifyFacebookComment,
  classifyFacebookLeadUrgency,
  decideFacebookRetry,
  detectFacebookLeadDuplicate,
  evaluateFacebookPublishEligibility,
  facebookAuraRequiresConfirmation,
  assertFacebookBasicOAuthUrl,
  FACEBOOK_LEGACY_FULL_OAUTH_SCOPES,
  FACEBOOK_OAUTH_BASIC_SCOPES,
  FACEBOOK_OAUTH_OPTIONAL_SCOPES,
  resolveFacebookExtendedCapabilityStatus,
  isFacebookOriginatedUtm,
  isWithinMessengerWindow,
  missingFacebookPermissions,
  nextFacebookPublishAttempt,
  parseFacebookUtm,
  redactFacebookAuditMetadata,
  resolveFacebookCapabilities,
  resolveFacebookCapability,
  resolveFacebookConnectionState,
  resolveFacebookMessengerAvailability,
  shouldSendFacebookNotification,
  validateFacebookMedia,
  validateFacebookSchedule,
  YOUNG_GUNS_BRAND,
  type FacebookConnectionStateInput,
  type FacebookVerificationOutcome,
} from './facebook-business.js';

const NOW = new Date('2026-08-04T10:00:00.000Z');

function verification(
  overrides: Partial<FacebookVerificationOutcome> = {},
): FacebookVerificationOutcome {
  return {
    ok: true,
    authError: false,
    permissionError: false,
    providerUnavailable: false,
    checkedAt: NOW,
    message: 'ok',
    ...overrides,
  };
}

function connectionInput(
  overrides: Partial<FacebookConnectionStateInput> = {},
): FacebookConnectionStateInput {
  return {
    appConfigured: true,
    hasStoredToken: true,
    pageSelected: true,
    tokenExpiresAt: null,
    grantedPermissions: [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'pages_manage_engagement',
      'pages_manage_metadata',
      'pages_messaging',
      'leads_retrieval',
      'pages_read_user_content',
      'read_insights',
    ],
    lastVerification: verification(),
    disconnectedAt: null,
    now: NOW,
    ...overrides,
  };
}

describe('facebook connection honesty (Phase C)', () => {
  it('reports connected only after a verified provider request', () => {
    const result = resolveFacebookConnectionState(connectionInput());
    assert.equal(result.state, 'connected');
    assert.equal(result.usable, true);
    assert.equal(result.requiredAction, null);
  });

  it('never claims connected from a stored token alone', () => {
    const result = resolveFacebookConnectionState(connectionInput({ lastVerification: null }));
    assert.equal(result.state, 'partial');
    assert.equal(result.usable, false);
  });

  it('requires configuration when no Meta app credentials exist', () => {
    const result = resolveFacebookConnectionState(connectionInput({ appConfigured: false }));
    assert.equal(result.state, 'configuration_required');
    assert.match(result.requiredAction ?? '', /META_APP_ID/);
  });

  it('reports disconnected with no stored token', () => {
    const result = resolveFacebookConnectionState(connectionInput({ hasStoredToken: false }));
    assert.equal(result.state, 'disconnected');
  });

  it('reports expired once the token expiry has passed', () => {
    const result = resolveFacebookConnectionState(
      connectionInput({ tokenExpiresAt: new Date(NOW.getTime() - 1000) }),
    );
    assert.equal(result.state, 'expired');
  });

  it('reports reauthorisation required when Meta rejects the credentials', () => {
    const result = resolveFacebookConnectionState(
      connectionInput({
        lastVerification: verification({ ok: false, authError: true, message: 'code 190' }),
      }),
    );
    assert.equal(result.state, 'reauthorisation_required');
  });

  it('prefers provider unavailable over blaming our credentials', () => {
    const result = resolveFacebookConnectionState(
      connectionInput({
        lastVerification: verification({
          ok: false,
          authError: true,
          providerUnavailable: true,
          message: 'graph 503',
        }),
      }),
    );
    assert.equal(result.state, 'provider_unavailable');
  });

  it('reports partial when authorised but no Page selected', () => {
    const result = resolveFacebookConnectionState(connectionInput({ pageSelected: false }));
    assert.equal(result.state, 'partial');
  });

  it('reports missing permission when list_pages was not granted', () => {
    const result = resolveFacebookConnectionState(
      connectionInput({ grantedPermissions: [] }),
    );
    assert.equal(result.state, 'missing_permission');
    assert.ok(result.missingPermissions.includes('pages_manage_posts'));
  });

  it('stays connected with basic scope only and lists optional permissions Meta withheld', () => {
    const result = resolveFacebookConnectionState(
      connectionInput({
        grantedPermissions: ['pages_show_list'],
      }),
    );
    assert.equal(result.state, 'connected');
    assert.ok(result.missingPermissions.includes('pages_manage_posts'));
    assert.ok(result.missingPermissions.includes('leads_retrieval'));
    assert.equal(
      result.capabilities.find((entry) => entry.capability === 'publish_posts')?.available,
      false,
    );
  });

  it('honours an explicit disconnect over stored credentials', () => {
    const result = resolveFacebookConnectionState(connectionInput({ disconnectedAt: NOW }));
    assert.equal(result.state, 'disconnected');
  });
});

describe('facebook capabilities follow granted permissions', () => {
  it('blocks a capability and names the permission Meta withheld', () => {
    const capability = resolveFacebookCapability('retrieve_leads', ['pages_show_list']);
    assert.equal(capability.available, false);
    assert.deepEqual(capability.missingPermissions, ['leads_retrieval']);
    assert.match(capability.blockedReason, /leads_retrieval/);
  });

  it('reports every capability as blocked when nothing is granted', () => {
    const capabilities = resolveFacebookCapabilities([]);
    assert.equal(
      capabilities.every((entry) => !entry.available),
      true,
    );
  });

  it('lists the permissions still outstanding', () => {
    assert.deepEqual(missingFacebookPermissions(['pages_show_list', 'read_insights']).length, 7);
  });
});

describe('content workspace and approval gate (Phase D)', () => {
  it('allows only the documented transitions', () => {
    assert.equal(canTransitionFacebookContent('draft', 'in_review'), true);
    assert.equal(canTransitionFacebookContent('in_review', 'approved'), true);
    assert.equal(canTransitionFacebookContent('publishing', 'published'), true);
    assert.equal(canTransitionFacebookContent('failed', 'approved'), true);
  });

  it('refuses to jump straight from draft to published', () => {
    assert.equal(canTransitionFacebookContent('draft', 'published'), false);
    assert.equal(canTransitionFacebookContent('draft', 'approved'), false);
    assert.equal(canTransitionFacebookContent('published', 'draft'), false);
    assert.equal(canTransitionFacebookContent('cancelled', 'approved'), false);
  });

  const capabilities = resolveFacebookCapabilities(['pages_manage_posts', 'pages_read_engagement']);

  it('publishes only approved content on a verified connection', () => {
    const result = evaluateFacebookPublishEligibility({
      status: 'approved',
      approvedByUserId: 'user-1',
      approvedAt: NOW,
      connectionState: 'connected',
      capabilities,
      scheduledFor: null,
      now: NOW,
    });
    assert.equal(result.eligible, true);
  });

  it('refuses unapproved content', () => {
    const result = evaluateFacebookPublishEligibility({
      status: 'draft',
      approvedByUserId: null,
      approvedAt: null,
      connectionState: 'connected',
      capabilities,
      scheduledFor: null,
      now: NOW,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reasonCode, 'not_approved');
  });

  it('refuses approved status that carries no approval record', () => {
    const result = evaluateFacebookPublishEligibility({
      status: 'approved',
      approvedByUserId: null,
      approvedAt: null,
      connectionState: 'connected',
      capabilities,
      scheduledFor: null,
      now: NOW,
    });
    assert.equal(result.reasonCode, 'missing_approval_record');
  });

  it('refuses to publish over an unverified connection', () => {
    const result = evaluateFacebookPublishEligibility({
      status: 'approved',
      approvedByUserId: 'user-1',
      approvedAt: NOW,
      connectionState: 'partial',
      capabilities,
      scheduledFor: null,
      now: NOW,
    });
    assert.equal(result.reasonCode, 'connection_not_usable');
  });

  it('refuses to publish without pages_manage_posts', () => {
    const result = evaluateFacebookPublishEligibility({
      status: 'approved',
      approvedByUserId: 'user-1',
      approvedAt: NOW,
      connectionState: 'connected',
      capabilities: resolveFacebookCapabilities(['pages_read_engagement']),
      scheduledFor: null,
      now: NOW,
    });
    assert.equal(result.reasonCode, 'missing_permission');
  });

  it('holds a scheduled post until it is due', () => {
    const result = evaluateFacebookPublishEligibility({
      status: 'scheduled',
      approvedByUserId: 'user-1',
      approvedAt: NOW,
      connectionState: 'connected',
      capabilities,
      scheduledFor: new Date(NOW.getTime() + 60_000),
      now: NOW,
    });
    assert.equal(result.reasonCode, 'schedule_not_due');
  });

  it('never republishes an already published post', () => {
    const result = evaluateFacebookPublishEligibility({
      status: 'published',
      approvedByUserId: 'user-1',
      approvedAt: NOW,
      connectionState: 'connected',
      capabilities,
      scheduledFor: null,
      now: NOW,
    });
    assert.equal(result.reasonCode, 'already_published');
  });
});

describe('scheduling and duplicate-safe retries (Phase F)', () => {
  it('rejects a schedule inside the Facebook minimum lead time', () => {
    const result = validateFacebookSchedule(new Date(NOW.getTime() + 60_000), NOW);
    assert.equal(result.valid, false);
  });

  it('rejects a schedule beyond the Facebook maximum lead time', () => {
    const result = validateFacebookSchedule(
      new Date(NOW.getTime() + 200 * 24 * 60 * 60 * 1000),
      NOW,
    );
    assert.equal(result.valid, false);
  });

  it('accepts a valid schedule and returns unix seconds for Graph', () => {
    const target = new Date(NOW.getTime() + 60 * 60 * 1000);
    const result = validateFacebookSchedule(target, NOW);
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.unixSeconds, Math.floor(target.getTime() / 1000));
    }
  });

  it('keeps the idempotency key stable for the same attempt', () => {
    const key = buildFacebookIdempotencyKey({ companyId: 'c1', contentId: 'p1', attempt: 2 });
    assert.equal(key, buildFacebookIdempotencyKey({ companyId: 'c1', contentId: 'p1', attempt: 2 }));
    assert.notEqual(
      key,
      buildFacebookIdempotencyKey({ companyId: 'c1', contentId: 'p1', attempt: 3 }),
    );
  });

  it('reuses the attempt number when the previous request may have reached Facebook', () => {
    assert.equal(nextFacebookPublishAttempt({ attempts: 2, lastAttemptReachedProvider: true }), 2);
    assert.equal(nextFacebookPublishAttempt({ attempts: 2, lastAttemptReachedProvider: false }), 3);
  });
});

describe('brand controls (Phase E)', () => {
  it('carries the verified Young Guns contact details and no invented logo', () => {
    assert.equal(YOUNG_GUNS_BRAND.phone, '066 234 6301');
    assert.equal(YOUNG_GUNS_BRAND.email, 'ygplumberswp@gmail.com');
    assert.equal(YOUNG_GUNS_BRAND.logoAssetId, null);
  });

  it('detects the phone number regardless of spacing', () => {
    const result = checkFacebookBrandCompliance(
      'Blocked drain? Call 066-234-6301 or email ygplumberswp@gmail.com',
    );
    assert.equal(result.includesPhone, true);
    assert.equal(result.includesEmail, true);
    assert.equal(result.passed, true);
  });

  it('warns without failing when contact details are absent', () => {
    const result = checkFacebookBrandCompliance('We fix leaks fast.');
    assert.equal(result.passed, false);
    assert.equal(result.warnings.length, 2);
  });
});

describe('media validation and privacy (Phase G)', () => {
  it('rejects an unsupported file type', () => {
    const result = validateFacebookMedia({
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      byteSize: 1000,
    });
    assert.equal(result.valid, false);
  });

  it('rejects an oversized image', () => {
    const result = validateFacebookMedia({
      fileName: 'big.jpg',
      mimeType: 'image/jpeg',
      byteSize: 9 * 1024 * 1024,
    });
    assert.equal(result.valid, false);
  });

  it('flags number plates for review on vehicle photos', () => {
    const result = validateFacebookMedia({
      fileName: 'bakkie.jpg',
      mimeType: 'image/jpeg',
      byteSize: 500_000,
      sourceContext: 'vehicle',
    });
    assert.equal(result.valid, true);
    assert.equal(result.privacyReviewRequired, true);
    assert.match(result.privacyNotes.join(' '), /number plate/i);
  });

  it('does not force a privacy decision on marketing library assets', () => {
    const result = validateFacebookMedia({
      fileName: 'promo.png',
      mimeType: 'image/png',
      byteSize: 100_000,
      sourceContext: 'marketing_library',
    });
    assert.equal(result.privacyReviewRequired, false);
  });
});

describe('comment classification (Phase H)', () => {
  it('treats a pricing question as an enquiry worth a lead', () => {
    const result = classifyFacebookComment('Hi, how much for a geyser replacement?');
    assert.equal(result.classification, 'enquiry');
    assert.equal(result.leadCandidate, true);
  });

  it('prioritises a complaint over an enquiry', () => {
    const result = classifyFacebookComment('Worst service, still leaking, I want a refund');
    assert.equal(result.classification, 'complaint');
    assert.equal(result.leadCandidate, false);
  });

  it('detects spam ahead of everything else', () => {
    const result = classifyFacebookComment('Click here for free money in crypto');
    assert.equal(result.classification, 'spam');
  });

  it('leaves an unclear comment for a human', () => {
    const result = classifyFacebookComment('Interesting.');
    assert.equal(result.classification, 'general');
    assert.equal(result.confident, false);
  });
});

describe('messenger gating (Phase I)', () => {
  it('reports Messenger blocked without pages_messaging', () => {
    const result = resolveFacebookMessengerAvailability(['pages_show_list']);
    assert.equal(result.available, false);
    assert.match(result.reason, /App Review/);
  });

  it('enables Messenger once pages_messaging is granted', () => {
    assert.equal(resolveFacebookMessengerAvailability(['pages_messaging']).available, true);
  });

  it('enforces Meta 24-hour standard messaging window', () => {
    assert.equal(isWithinMessengerWindow(new Date(NOW.getTime() - 60 * 60 * 1000), NOW), true);
    assert.equal(isWithinMessengerWindow(new Date(NOW.getTime() - 25 * 60 * 60 * 1000), NOW), false);
  });
});

describe('lead duplicate detection (Phase J)', () => {
  const existing = [
    {
      leadId: 'lead-1',
      fullName: 'John Smith',
      email: 'john@example.com',
      phone: '+27 82 111 2222',
      externalLeadId: 'fb-lead-1',
    },
  ];

  it('matches an already imported Facebook lead id', () => {
    const result = detectFacebookLeadDuplicate(
      { fullName: 'Different Name', email: null, phone: null, externalLeadId: 'fb-lead-1' },
      existing,
    );
    assert.equal(result.outcome, 'duplicate');
    assert.deepEqual(result.matchedOn, ['external_lead_id']);
  });

  it('matches on phone regardless of country-code formatting', () => {
    const result = detectFacebookLeadDuplicate(
      { fullName: null, email: null, phone: '082 111 2222', externalLeadId: null },
      existing,
    );
    assert.equal(result.outcome, 'duplicate');
    assert.deepEqual(result.matchedOn, ['phone']);
  });

  it('refuses to merge on a name alone', () => {
    const result = detectFacebookLeadDuplicate(
      { fullName: 'john smith', email: null, phone: null, externalLeadId: null },
      existing,
    );
    assert.equal(result.outcome, 'review');
    assert.match(result.reason, /will not merge/i);
  });

  it('creates a new lead when nothing matches', () => {
    const result = detectFacebookLeadDuplicate(
      { fullName: 'Jane Doe', email: 'jane@example.com', phone: '083 000 0000', externalLeadId: null },
      existing,
    );
    assert.equal(result.outcome, 'new');
  });
});

describe('utm attribution parsing', () => {
  it('reads campaign parameters from a tracked link', () => {
    const utm = parseFacebookUtm(
      'https://younggunsplumbing.co.za/?utm_source=facebook&utm_medium=social&utm_campaign=winter',
    );
    assert.equal(utm.campaign, 'winter');
    assert.equal(isFacebookOriginatedUtm(utm), true);
  });

  it('does not claim a non-Facebook source', () => {
    const utm = parseFacebookUtm('https://example.com/?utm_source=google');
    assert.equal(isFacebookOriginatedUtm(utm), false);
  });

  it('survives a malformed url', () => {
    assert.equal(parseFacebookUtm('not a url').source, null);
  });
});

describe('lead workflow (Phase K)', () => {
  it('follows the documented stage order', () => {
    assert.equal(canTransitionFacebookLeadStage('imported', 'matched'), true);
    assert.equal(canTransitionFacebookLeadStage('reply_drafted', 'reply_approved'), true);
    assert.equal(canTransitionFacebookLeadStage('reply_approved', 'responded'), true);
  });

  it('will not send a reply that skipped approval', () => {
    assert.equal(canTransitionFacebookLeadStage('reply_drafted', 'responded'), false);
    assert.equal(canTransitionFacebookLeadStage('closed', 'imported'), false);
  });

  it('classifies a burst pipe as an emergency', () => {
    assert.equal(classifyFacebookLeadUrgency('Burst pipe, water everywhere!').urgency, 'emergency');
    assert.equal(classifyFacebookLeadUrgency('Small leak under the sink').urgency, 'high');
    assert.equal(classifyFacebookLeadUrgency('Looking for a quote next month').urgency, 'normal');
  });
});

describe('insights coverage (Phase L)', () => {
  it('reports no coverage rather than zeros when Facebook returns nothing', () => {
    const coverage = buildFacebookInsightCoverage({
      requestedFrom: new Date('2026-07-01T00:00:00Z'),
      requestedTo: new Date('2026-07-31T00:00:00Z'),
      returnedDates: [],
      source: 'organic',
    });
    assert.equal(coverage.complete, false);
    assert.equal(coverage.coveredFrom, null);
    assert.match(coverage.note, /rather than showing zeros/);
  });

  it('reports partial coverage honestly', () => {
    const coverage = buildFacebookInsightCoverage({
      requestedFrom: new Date('2026-07-01T00:00:00Z'),
      requestedTo: new Date('2026-07-31T00:00:00Z'),
      returnedDates: [new Date('2026-07-20T00:00:00Z'), new Date('2026-07-25T00:00:00Z')],
      source: 'organic',
    });
    assert.equal(coverage.complete, false);
    assert.equal(coverage.coveredFrom, '2026-07-20T00:00:00.000Z');
  });

  it('reports complete coverage when the full range came back', () => {
    const coverage = buildFacebookInsightCoverage({
      requestedFrom: new Date('2026-07-01T00:00:00Z'),
      requestedTo: new Date('2026-07-03T00:00:00Z'),
      returnedDates: [new Date('2026-07-01T00:00:00Z'), new Date('2026-07-03T00:00:00Z')],
      source: 'paid',
    });
    assert.equal(coverage.complete, true);
    assert.equal(coverage.source, 'paid');
  });
});

describe('attribution never over-claims (Phase M)', () => {
  it('credits value only when every step is evidenced', () => {
    const chain = buildFacebookAttributionChain({
      links: [
        { step: 'post', entityId: 'p1', evidence: 'observed', occurredAt: null },
        { step: 'enquiry', entityId: 'e1', evidence: 'observed', occurredAt: null },
        { step: 'lead', entityId: 'l1', evidence: 'observed', occurredAt: null },
        { step: 'quote', entityId: 'q1', evidence: 'observed', occurredAt: null },
        { step: 'job', entityId: 'j1', evidence: 'observed', occurredAt: null },
        { step: 'invoice', entityId: 'i1', evidence: 'observed', occurredAt: null },
        { step: 'payment', entityId: 'pay1', evidence: 'observed', occurredAt: null },
      ],
      paymentValueCents: 450_000,
    });
    assert.equal(chain.complete, true);
    assert.equal(chain.attributedValueCents, 450_000);
  });

  it('stops at the first missing link and attributes no value', () => {
    const chain = buildFacebookAttributionChain({
      links: [
        { step: 'post', entityId: 'p1', evidence: 'observed', occurredAt: null },
        { step: 'enquiry', entityId: 'e1', evidence: 'observed', occurredAt: null },
        { step: 'payment', entityId: 'pay1', evidence: 'observed', occurredAt: null },
      ],
      paymentValueCents: 450_000,
    });
    assert.equal(chain.confirmedThrough, 'enquiry');
    assert.equal(chain.complete, false);
    assert.equal(chain.attributedValueCents, null);
  });

  it('claims nothing when the post led nowhere', () => {
    const chain = buildFacebookAttributionChain({ links: [], paymentValueCents: 100 });
    assert.equal(chain.confirmedThrough, null);
    assert.equal(chain.attributedValueCents, null);
  });
});

describe('AURA confirmation (Phase N)', () => {
  it('requires confirmation for anything that reaches a customer', () => {
    assert.equal(facebookAuraRequiresConfirmation('draft_comment_reply'), true);
    assert.equal(facebookAuraRequiresConfirmation('draft_lead_reply'), true);
  });

  it('lets AURA draft internally without a confirmation step', () => {
    assert.equal(facebookAuraRequiresConfirmation('draft_post'), false);
    assert.equal(facebookAuraRequiresConfirmation('summarise_performance'), false);
  });
});

describe('owner dashboard card (Phase O)', () => {
  it('carries only workflow counts, never follower or reach figures', () => {
    const card = buildFacebookDashboardCard({
      pageName: 'Young Guns Plumbing',
      state: 'connected',
      lastSyncedAt: NOW.toISOString(),
      awaitingApproval: 2,
      newLeads: 1,
      unansweredComments: 3,
    });
    assert.equal(card.visible, true);
    assert.equal(card.stateLabel, 'Connected');
    assert.equal(Object.keys(card).includes('followers'), false);
    assert.equal(Object.keys(card).includes('reach'), false);
  });

  it('hides itself when no Meta app is configured', () => {
    const card = buildFacebookDashboardCard({
      pageName: null,
      state: 'configuration_required',
      lastSyncedAt: null,
      awaitingApproval: 0,
      newLeads: 0,
      unansweredComments: 0,
    });
    assert.equal(card.visible, false);
  });
});

describe('notifications dedupe (Phase P)', () => {
  it('produces one key per underlying problem', () => {
    const key = buildFacebookNotificationDedupeKey({
      companyId: 'c1',
      kind: 'connection_broken',
      subjectId: null,
    });
    assert.equal(
      key,
      buildFacebookNotificationDedupeKey({
        companyId: 'c1',
        kind: 'connection_broken',
        subjectId: null,
      }),
    );
  });

  it('does not re-notify an unresolved problem within the repeat window', () => {
    assert.equal(
      shouldSendFacebookNotification({
        lastSentAt: new Date(NOW.getTime() - 60 * 60 * 1000),
        resolvedSinceLastSend: false,
        now: NOW,
      }),
      false,
    );
  });

  it('notifies again once the problem recurs after resolving', () => {
    assert.equal(
      shouldSendFacebookNotification({
        lastSentAt: new Date(NOW.getTime() - 60 * 60 * 1000),
        resolvedSinceLastSend: true,
        now: NOW,
      }),
      true,
    );
  });
});

describe('retry policy (Phase Q)', () => {
  it('retries a transient failure with backoff', () => {
    const decision = decideFacebookRetry({ attempt: 1, transient: true });
    assert.equal(decision.retry, true);
    assert.equal(decision.delaySeconds, 60);
  });

  it('never loops on a permission failure', () => {
    assert.equal(decideFacebookRetry({ attempt: 1, transient: false }).retry, false);
  });

  it('gives up and escalates after the attempt limit', () => {
    assert.equal(decideFacebookRetry({ attempt: 5, transient: true }).retry, false);
  });
});

describe('facebook OAuth scope tiers (J-6.7F invalid-scope correction)', () => {
  it('documents legacy scopes that caused Meta invalid-scope failure', () => {
    assert.ok(FACEBOOK_LEGACY_FULL_OAUTH_SCOPES.includes('pages_messaging'));
    assert.ok(FACEBOOK_LEGACY_FULL_OAUTH_SCOPES.includes('leads_retrieval'));
    assert.ok(FACEBOOK_LEGACY_FULL_OAUTH_SCOPES.includes('read_insights'));
  });

  it('basic tier is pages_show_list only', () => {
    assert.deepEqual(FACEBOOK_OAUTH_BASIC_SCOPES, ['pages_show_list']);
  });

  it('optional tier excludes messaging leads insights from basic request', () => {
    assert.ok(FACEBOOK_OAUTH_OPTIONAL_SCOPES.includes('pages_messaging'));
    assert.ok(FACEBOOK_OAUTH_OPTIONAL_SCOPES.includes('leads_retrieval'));
    assert.ok(!FACEBOOK_OAUTH_BASIC_SCOPES.includes('pages_messaging'));
  });

  it('classifies Messenger as REQUIRES_META_ACCESS when not granted', () => {
    assert.equal(
      resolveFacebookExtendedCapabilityStatus('read_messages', ['pages_show_list']),
      'REQUIRES_META_ACCESS',
    );
  });

  it('validates basic OAuth URL helper rejects forbidden scopes', () => {
    const bad = assertFacebookBasicOAuthUrl(
      'https://www.facebook.com/v21.0/dialog/oauth?client_id=1&redirect_uri=https%3A%2F%2Fexample.com&state=s&scope=pages_show_list,pages_messaging',
    );
    assert.equal(bad.ok, false);
    const good = assertFacebookBasicOAuthUrl(
      'https://www.facebook.com/v21.0/dialog/oauth?client_id=1&redirect_uri=https%3A%2F%2Fexample.com&state=s&scope=pages_show_list',
    );
    assert.equal(good.ok, true);
  });
});

describe('RBAC (Phase R)', () => {
  it('denies Technician and Client outright', () => {
    assert.equal(canAccessFacebookBusiness({ roleName: 'Technician', permissions: ['*'] }), false);
    assert.equal(canAccessFacebookBusiness({ roleName: 'Client', permissions: ['*'] }), false);
    assert.equal(canWorkFacebookLeads({ roleName: 'Technician', permissions: ['*'] }), false);
  });

  it('gives a marketing manager read and write but not approval', () => {
    const manager = { roleName: 'Manager', permissions: ['marketing:read', 'marketing:write'] };
    assert.equal(canAccessFacebookBusiness(manager), true);
    assert.equal(canWriteFacebookBusiness(manager), true);
    assert.equal(canApproveFacebookContent(manager), false);
    assert.equal(canManageFacebookConnection(manager), false);
  });

  it('lets the Owner approve content and manage the connection', () => {
    const owner = { roleName: 'Company Owner', permissions: ['marketing:write'] };
    assert.equal(canApproveFacebookContent(owner), true);
    assert.equal(canManageFacebookConnection(owner), true);
  });

  it('denies Admin with marketing_intelligence:manage from managing the connection', () => {
    const admin = {
      roleName: 'Office Admin',
      permissions: ['marketing_intelligence:manage', 'marketing:read'],
    };
    assert.equal(canAccessFacebookBusiness(admin), true);
    assert.equal(canManageFacebookConnection(admin), false);
  });

  it('lets a sales role work leads without marketing write', () => {
    assert.equal(canWorkFacebookLeads({ roleName: 'Sales', permissions: ['leads:write'] }), true);
  });
});

describe('audit redaction (Phase S)', () => {
  it('redacts secrets while proving a value was present', () => {
    const redacted = redactFacebookAuditMetadata({
      pageId: '123',
      access_token: 'EAAG-secret',
      nested: { client_secret: 'shhh', pageName: 'Young Guns Plumbing' },
    });
    assert.equal(redacted.pageId, '123');
    assert.equal(redacted.access_token, '[redacted]');
    assert.deepEqual(redacted.nested, {
      client_secret: '[redacted]',
      pageName: 'Young Guns Plumbing',
    });
  });

  it('leaves an absent secret as null rather than inventing one', () => {
    assert.equal(redactFacebookAuditMetadata({ refreshToken: null }).refreshToken, null);
  });
});
