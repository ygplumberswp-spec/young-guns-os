import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSfiObjectionDraft,
  buildSfiQuoteFollowUpItem,
  buildSfiQuoteReminderDraft,
  buildSfiReactivationDraft,
  canAccessSalesFollowupIntelligence,
  canApproveSalesFollowupIntelligence,
  canWriteSalesFollowupIntelligence,
  defaultSfiSettings,
  detectSfiObjectionCategory,
  emptySfiDraftKindCounts,
  isSfiOpenQuoteStatus,
  sfiDaysBetween,
  SFI_PRODUCT_COPY,
} from './sales-followup-intelligence.js';

describe('sales follow-up intelligence', () => {
  it('RBAC: sales/quotes access; Technician/Client denied', () => {
    assert.equal(
      canAccessSalesFollowupIntelligence({
        roleName: 'Admin',
        permissions: ['sales:read'],
      }),
      true,
    );
    assert.equal(
      canAccessSalesFollowupIntelligence({
        roleName: 'Technician',
        permissions: ['*', 'sales:write'],
      }),
      false,
    );
    assert.equal(
      canAccessSalesFollowupIntelligence({
        roleName: 'Client',
        permissions: ['quotes:read'],
      }),
      false,
    );
    assert.equal(
      canWriteSalesFollowupIntelligence({
        roleName: 'Office Staff',
        permissions: ['sales:read'],
      }),
      false,
    );
    assert.equal(
      canApproveSalesFollowupIntelligence({
        roleName: 'Owner',
        permissions: ['sales:write'],
      }),
      true,
    );
  });

  it('objection detection stays unavailable without real text', () => {
    const empty = detectSfiObjectionCategory(null);
    assert.equal(empty.category, 'unavailable');
    assert.equal(empty.availability, 'unavailable');

    const price = detectSfiObjectionCategory('The price is too expensive for our budget');
    assert.equal(price.category, 'price');
    assert.equal(price.availability, 'available');
  });

  it('draft builders are explicitly non-send', () => {
    const reminder = buildSfiQuoteReminderDraft({
      customerName: 'Alex',
      quoteNumber: 'Q-100',
      quoteTitle: 'Geyser',
      totalCents: 250000,
      currency: 'ZAR',
      validUntil: null,
    });
    assert.ok(reminder.subject.startsWith('DRAFT:'));
    assert.ok(reminder.body.includes('Nothing was sent'));
    assert.equal(reminder.autoSend, false);

    const objection = buildSfiObjectionDraft({
      customerName: 'Alex',
      category: 'price',
      quoteNumber: 'Q-100',
      signalText: 'Too expensive',
    });
    assert.equal(objection.kind, 'price_objection');
    assert.ok(objection.body.includes('Nothing was sent'));
    assert.equal(objection.autoSend, false);

    const reactivation = buildSfiReactivationDraft({
      customerName: 'Alex',
      kind: 'maintenance_opportunity',
      lastJobAt: '2026-01-01T00:00:00.000Z',
      completedJobCount: 2,
      maintenancePlanName: 'Annual geyser',
    });
    assert.equal(reactivation.draftKind, 'maintenance_opportunity');
    assert.ok(reactivation.body.includes('No fake campaign'));
    assert.equal(reactivation.autoSend, false);
    assert.equal(emptySfiDraftKindCounts().quote_reminder, 0);
    assert.ok(SFI_PRODUCT_COPY.thisLayer.includes('auto-sent'));
  });

  it('quote follow-up items use real quote timing only', () => {
    const issued = new Date();
    issued.setDate(issued.getDate() - 10);
    const item = buildSfiQuoteFollowUpItem({
      quoteId: 'q1',
      quoteNumber: 'Q-1',
      title: 'Work',
      status: 'sent',
      customerId: 'c1',
      customerName: 'Pat',
      totalCents: 10000,
      currency: 'ZAR',
      issuedAt: issued.toISOString(),
      validUntil: null,
      staleQuoteDays: 7,
      responseStatus: 'awaiting',
      lastResponseAt: null,
      scheduledFollowUpAt: null,
    });
    assert.equal(item.reminderRecommended, true);
    assert.equal(item.responseAvailability, 'available');

    const noIssueDate = buildSfiQuoteFollowUpItem({
      quoteId: 'q2',
      quoteNumber: 'Q-2',
      title: 'Work',
      status: 'sent',
      customerId: 'c1',
      customerName: 'Pat',
      totalCents: 10000,
      currency: 'ZAR',
      issuedAt: null,
      validUntil: null,
      staleQuoteDays: 7,
      responseStatus: 'unavailable',
      lastResponseAt: null,
      scheduledFollowUpAt: null,
    });
    assert.equal(noIssueDate.daysSinceIssued, null);
    assert.equal(noIssueDate.reminderRecommended, false);
    assert.equal(noIssueDate.responseAvailability, 'unavailable');
  });

  it('settings default to approval-gated, never auto-send', () => {
    const settings = defaultSfiSettings(new Date('2026-01-01T00:00:00.000Z'));
    assert.equal(settings.autoSendEnabled, false);
    assert.equal(settings.defaultChannel, 'email');
    assert.equal(settings.staleQuoteDays, 7);
    assert.equal(settings.reactivationIdleDays, 90);
    assert.equal(settings.updatedAt, '2026-01-01T00:00:00.000Z');
  });

  it('open quote statuses and day maths are honest about missing data', () => {
    assert.equal(isSfiOpenQuoteStatus('sent'), true);
    assert.equal(isSfiOpenQuoteStatus('draft'), false);
    assert.equal(sfiDaysBetween(null), null);
    assert.equal(sfiDaysBetween('not-a-date'), null);
    assert.equal(
      sfiDaysBetween('2026-01-01T00:00:00.000Z', new Date('2026-01-11T00:00:00.000Z')),
      10,
    );
  });
});
