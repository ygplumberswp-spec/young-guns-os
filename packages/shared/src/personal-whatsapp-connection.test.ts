import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPersonalWaTestingSupport,
  canAccessPersonalWhatsappConnection,
  emptyPersonalWaConnectionSummary,
  emptyPersonalWaPrivacy,
  formatPersonalWaConnectionStatus,
  normalizePersonalWaPhoneInput,
  PERSONAL_WA_CONNECTION_PRODUCT_COPY,
} from './personal-whatsapp-connection.js';

describe('personal whatsapp connection layer', () => {
  it('Platform Owner only — wildcards on other roles never grant access', () => {
    assert.equal(
      canAccessPersonalWhatsappConnection({
        roleName: 'Platform Owner',
        permissions: [],
      }),
      true,
    );
    for (const roleName of [
      'Company Owner',
      'Owner',
      'Admin',
      'Office Staff',
      'Technician',
      'Client',
    ]) {
      assert.equal(
        canAccessPersonalWhatsappConnection({
          roleName,
          permissions: ['*', 'communications:manage', 'integrations:manage'],
        }),
        false,
        `${roleName} must not access Personal WhatsApp Connection Layer`,
      );
    }
  });

  it('normalizes owner phone numbers to E.164-ish form', () => {
    assert.equal(normalizePersonalWaPhoneInput('+27 82 123 4567'), '+27821234567');
    assert.equal(normalizePersonalWaPhoneInput('27821234567'), '+27821234567');
    assert.equal(normalizePersonalWaPhoneInput('not-a-phone'), null);
    assert.equal(normalizePersonalWaPhoneInput(''), null);
  });

  it('formats connection statuses for UI', () => {
    assert.equal(formatPersonalWaConnectionStatus('not_configured'), 'Not Configured');
    assert.equal(formatPersonalWaConnectionStatus('reconnect_required'), 'Reconnect Required');
    assert.equal(formatPersonalWaConnectionStatus('connected'), 'Connected');
  });

  it('privacy defaults are locked private / no auto-import / approval required', () => {
    const privacy = emptyPersonalWaPrivacy({ syncEnabled: true });
    assert.equal(privacy.privateByDefault, true);
    assert.equal(privacy.excludeFromBusinessSearch, true);
    assert.equal(privacy.neverAutoImport, true);
    assert.equal(privacy.requireApprovalToSend, true);
    assert.equal(privacy.syncEnabled, true);
  });

  it('testing support honestly separates local vs Meta/device-link capabilities', () => {
    const support = buildPersonalWaTestingSupport({
      encryptionKeyConfigured: false,
      hasCredentials: false,
      hasLinkedPhone: false,
    });
    const byId = Object.fromEntries(support.map((item) => [item.id, item]));
    assert.equal(byId.owner_gate.availableWithoutMeta, true);
    assert.equal(byId.encrypt_credentials.availableWithoutMeta, false);
    assert.equal(byId.live_message_sync.availableWithoutMeta, false);
    assert.equal(byId.live_message_sync.requiresLiveMetaOrDeviceLink, true);
    assert.equal(byId.outbound_send.requiresLiveMetaOrDeviceLink, true);
    assert.equal(byId.device_qr_pairing.availableWithoutMeta, false);
  });

  it('empty connection summary never claims live provider verification', () => {
    const empty = emptyPersonalWaConnectionSummary();
    assert.equal(empty.sessionHealth.liveProviderVerified, false);
    assert.equal(empty.status, 'not_configured');
    assert.ok(PERSONAL_WA_CONNECTION_PRODUCT_COPY.thisLayer.includes('Never auto-sends'));
  });
});
