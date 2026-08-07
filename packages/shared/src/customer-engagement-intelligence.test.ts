import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateCeiSatisfaction,
  buildCeiEtaUpdateDraft,
  buildCeiFollowUpDraft,
  buildCeiMaintenanceReminderDraft,
  buildCeiNotificationDraft,
  buildCeiReviewRequestDraft,
  canAccessCustomerEngagementIntelligence,
  canApproveCustomerEngagementOutreach,
  canWriteCustomerEngagementIntelligence,
  CEI_PRODUCT_COPY,
  detectCeiSentimentFromText,
  emptyCeiDraftKindCounts,
  resolveCeiJobEtaSuggestion,
  scoreCeiCustomerRelationship,
} from './customer-engagement-intelligence.js';

describe('customer engagement intelligence', () => {
  it('RBAC: CX/customers/comms access; Technician/Client denied', () => {
    assert.equal(
      canAccessCustomerEngagementIntelligence({
        roleName: 'Admin',
        permissions: ['customer_experience:read'],
      }),
      true,
    );
    assert.equal(
      canAccessCustomerEngagementIntelligence({
        roleName: 'Technician',
        permissions: ['*', 'customer_experience:write'],
      }),
      false,
    );
    assert.equal(
      canAccessCustomerEngagementIntelligence({
        roleName: 'Client',
        permissions: ['customers:read'],
      }),
      false,
    );
    assert.equal(
      canWriteCustomerEngagementIntelligence({
        roleName: 'Office Staff',
        permissions: ['customer_experience:read'],
      }),
      false,
    );
    assert.equal(
      canApproveCustomerEngagementOutreach({
        roleName: 'Owner',
        permissions: ['customer_experience:write'],
      }),
      true,
    );
  });

  it('sentiment / satisfaction stay unavailable without real signals', () => {
    const empty = detectCeiSentimentFromText({ subject: null, body: null });
    assert.equal(empty.sentiment, 'unavailable');
    assert.equal(empty.confidence, null);

    const none = aggregateCeiSatisfaction({ ratings: [], sentiments: ['unavailable'] });
    assert.equal(none.availability, 'unavailable');
    assert.equal(none.averageRating, null);

    const rated = aggregateCeiSatisfaction({
      ratings: [5, 4, null],
      sentiments: ['positive', 'unavailable'],
    });
    assert.equal(rated.availability, 'available');
    assert.equal(rated.averageRating, 4.5);
  });

  it('ETA suggestions use real schedule data only', () => {
    const unavailable = resolveCeiJobEtaSuggestion({
      jobId: 'j1',
      customerId: 'c1',
      customerName: 'Pat',
      jobTitle: 'Geyser',
      status: 'completed',
      assignedUserId: 'u1',
      scheduledAt: '2026-08-03T10:00:00.000Z',
      scheduledEndAt: '2026-08-03T12:00:00.000Z',
    });
    assert.equal(unavailable.availability, 'unavailable');

    const available = resolveCeiJobEtaSuggestion({
      jobId: 'j2',
      customerId: 'c1',
      customerName: 'Pat',
      jobTitle: 'Geyser',
      status: 'scheduled',
      assignedUserId: 'u1',
      scheduledAt: '2026-08-03T10:00:00.000Z',
      scheduledEndAt: '2026-08-03T12:00:00.000Z',
    });
    assert.equal(available.availability, 'available');
    assert.equal(available.etaAt, '2026-08-03T12:00:00.000Z');
  });

  it('draft builders are explicitly non-send including follow-up and maintenance', () => {
    assert.ok(buildCeiNotificationDraft({ customerName: 'Alex' }).body.includes('Nothing was sent'));
    assert.equal(
      buildCeiEtaUpdateDraft({ customerName: 'Alex', etaAt: null }).etaAvailability,
      'unavailable',
    );
    assert.ok(buildCeiReviewRequestDraft({ customerName: 'Alex' }).body.includes('Nothing was sent'));
    const follow = buildCeiFollowUpDraft({
      customerName: 'Alex',
      reason: 'upcoming_maintenance',
      maintenancePlanName: 'Geyser annual',
    });
    assert.ok(follow.subject.startsWith('DRAFT:'));
    assert.ok(follow.body.includes('AURA follow-up'));
    assert.ok(follow.body.includes('Nothing was sent'));
    const maint = buildCeiMaintenanceReminderDraft({
      customerName: 'Alex',
      planName: 'Geyser annual',
      nextDueAt: null,
    });
    assert.ok(maint.body.includes('not available'));
    assert.ok(maint.body.includes('Nothing was sent'));
    assert.equal(emptyCeiDraftKindCounts().follow_up, 0);
    assert.equal(emptyCeiDraftKindCounts().maintenance_reminder, 0);
    assert.ok(CEI_PRODUCT_COPY.thisLayer.includes('never auto-send'));
  });

  it('relationship scoring stays unavailable without real signals', () => {
    const none = scoreCeiCustomerRelationship({
      jobCount: 0,
      completedJobCount: 0,
      averageRating: null,
      reviewCount: 0,
      communicationAverageScore: null,
      communicationMessageCount: 0,
      openMaintenancePlans: 0,
      overdueMaintenancePlans: 0,
    });
    assert.equal(none.availability, 'unavailable');
    assert.equal(none.relationshipScore, null);
    assert.equal(none.band, 'unavailable');

    const scored = scoreCeiCustomerRelationship({
      jobCount: 3,
      completedJobCount: 2,
      averageRating: 5,
      reviewCount: 1,
      communicationAverageScore: 80,
      communicationMessageCount: 4,
      openMaintenancePlans: 1,
      overdueMaintenancePlans: 0,
    });
    assert.equal(scored.availability, 'available');
    assert.ok(scored.relationshipScore !== null && scored.relationshipScore > 0);
    assert.ok(['strong', 'stable', 'at_risk'].includes(scored.band));
  });
});
