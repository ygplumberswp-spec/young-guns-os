import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildVairBookingDraft,
  buildVairCallStats,
  buildVairLeadDraft,
  buildVairProviderSnapshot,
  canAccessVoiceAiReceptionist,
  canApproveVairDrafts,
  canManageVairSettings,
  canWriteVoiceAiReceptionist,
  defaultVairSettings,
  listVairConnections,
  normalizePhoneDigits,
  VAIR_PRODUCT_COPY,
  VOICE_AI_RECEPTIONIST_KEY,
} from './voice-ai-receptionist.js';

describe('voice AI receptionist foundation', () => {
  it('RBAC: Owner/Admin and voice perms; Technician/Client denied', () => {
    assert.equal(VOICE_AI_RECEPTIONIST_KEY, 'voice-ai-receptionist');
    assert.equal(canAccessVoiceAiReceptionist({ roleName: 'Company Owner', permissions: [] }), true);
    assert.equal(canAccessVoiceAiReceptionist({ roleName: 'Manager', permissions: ['voice:read'] }), true);
    assert.equal(canAccessVoiceAiReceptionist({ roleName: 'Technician', permissions: ['*', 'voice:write'] }), false);
    assert.equal(canAccessVoiceAiReceptionist({ roleName: 'Client', permissions: ['voice:read'] }), false);
    assert.equal(canWriteVoiceAiReceptionist({ roleName: 'Admin', permissions: [] }), true);
    assert.equal(canApproveVairDrafts({ roleName: 'Manager', permissions: ['voice:write'] }), false);
    assert.equal(canManageVairSettings({ roleName: 'Platform Owner', permissions: [] }), true);
  });

  it('provider snapshot is honest when credentials missing', () => {
    const empty = buildVairProviderSnapshot({ telephonyProviderKey: null, ttsProviderKey: null, sttProviderKey: null });
    assert.equal(empty.telephonyStatus, 'not_configured');
    assert.equal(empty.ttsStatus, 'not_configured');
    assert.equal(empty.sttStatus, 'not_configured');
    assert.equal(empty.liveCallsEnabled, false);
    assert.ok(/not_configured/i.test(empty.rationale));
    assert.ok(/No fake calls/i.test(empty.rationale));
    const partial = buildVairProviderSnapshot({ telephonyProviderKey: 'twilio', ttsProviderKey: null, sttProviderKey: 'deepgram' });
    assert.equal(partial.telephonyStatus, 'configured');
    assert.equal(partial.ttsStatus, 'not_configured');
    assert.equal(partial.liveCallsEnabled, false);
  });

  it('call stats unavailable without real sessions — never invent traffic', () => {
    const empty = buildVairCallStats({ totalSessions: 0, activeSessions: 0, humanTakeoverCount: 0, completedSessions: 0 });
    assert.equal(empty.availability, 'unavailable');
    assert.ok(/not invented/i.test(empty.rationale));
    const real = buildVairCallStats({ totalSessions: 2, activeSessions: 1, humanTakeoverCount: 1, completedSessions: 1 });
    assert.equal(real.availability, 'available');
    assert.equal(real.totalSessions, 2);
  });

  it('lead/booking drafts are approval-gated copy only', () => {
    const lead = buildVairLeadDraft({ contactName: 'Thabo', contactPhone: '0821234567', serviceType: 'Geyser' });
    assert.equal(lead.kind, 'lead_create');
    assert.ok(/Approval-gated/i.test(lead.body));
    assert.ok(/not auto-executed/i.test(lead.body));
    const booking = buildVairBookingDraft({ customerId: 'cust-1', preferredAt: '2026-08-04T10:00:00Z', serviceType: 'Drain' });
    assert.equal(booking.kind, 'booking_draft');
    assert.ok(/never auto-executed/i.test(booking.body));
  });

  it('settings always keep human takeover available', () => {
    const settings = defaultVairSettings({ id: 's1' });
    assert.equal(settings.humanTakeoverAlwaysAvailable, true);
    assert.equal(settings.defaultLocale, 'en-ZA');
    assert.equal(settings.leadCreateRequiresApproval, true);
    assert.equal(settings.bookingExecuteRequiresApproval, true);
  });

  it('phone normalize supports SA local and +27 shapes', () => {
    assert.equal(normalizePhoneDigits('082 123 4567'), '27821234567');
    assert.equal(normalizePhoneDigits('+27 82 123 4567'), '27821234567');
    assert.equal(normalizePhoneDigits(null), null);
  });

  it('connections include CRM/jobs/scheduling and honest Customer 360 gap', () => {
    const connections = listVairConnections();
    assert.ok(connections.some((c) => c.target === 'crm'));
    assert.ok(connections.some((c) => c.target === 'jobs'));
    assert.ok(connections.some((c) => c.target === 'scheduling'));
    const c360 = connections.find((c) => c.target === 'customer_360');
    assert.ok(c360);
    assert.equal(c360?.status, 'unavailable');
    assert.ok(/not a dedicated module yet/i.test(VAIR_PRODUCT_COPY.customer360));
    assert.ok(/not built/i.test(c360?.note ?? ''));
  });
});
