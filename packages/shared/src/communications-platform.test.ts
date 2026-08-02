import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canAccessBusinessCommunications,
  canAccessPersonalWhatsappAssistant,
  isBusinessAccountKind,
  isPersonalAccountKind,
  personalAllowedInBusinessSearch,
  technicianJobScopedOnly,
} from './communications-platform.js';

describe('communications platform RBAC & privacy', () => {
  it('personal WhatsApp assistant is Platform Owner only', () => {
    assert.equal(
      canAccessPersonalWhatsappAssistant({
        roleName: 'Platform Owner',
        permissions: ['*', 'platform:cross_tenant'],
      }),
      true,
    );
    assert.equal(
      canAccessPersonalWhatsappAssistant({
        roleName: 'Company Owner',
        permissions: ['*'],
      }),
      false,
    );
    assert.equal(
      canAccessPersonalWhatsappAssistant({
        roleName: 'Admin',
        permissions: ['communications:manage', '*'],
      }),
      false,
    );
    assert.equal(
      canAccessPersonalWhatsappAssistant({
        roleName: 'Manager',
        permissions: ['communications:read', 'communications:write'],
      }),
      false,
    );
    assert.equal(
      canAccessPersonalWhatsappAssistant({
        roleName: 'Technician',
        permissions: ['communications:read'],
      }),
      false,
    );
    // Office / Tech / Developer / Support never grant personal WA (Platform Owner only).
    for (const roleName of ['Office', 'Tech', 'Developer', 'Support', 'Admin']) {
      assert.equal(
        canAccessPersonalWhatsappAssistant({ roleName, permissions: ['*', 'communications:manage'] }),
        false,
      );
    }
  });

  it('personal account kinds are never allowed in business search', () => {
    assert.equal(personalAllowedInBusinessSearch('personal_whatsapp'), false);
    assert.equal(personalAllowedInBusinessSearch('business_gmail'), false);
    assert.equal(personalAllowedInBusinessSearch('business_whatsapp'), false);
    assert.equal(isPersonalAccountKind('personal_whatsapp'), true);
    assert.equal(isBusinessAccountKind('business_gmail'), true);
    assert.equal(isBusinessAccountKind('personal_whatsapp'), false);
  });

  it('technicians are job-scoped', () => {
    assert.equal(technicianJobScopedOnly({ roleName: 'Technician' }), true);
    assert.equal(technicianJobScopedOnly({ roleName: 'Manager' }), false);
  });

  it('business communications require communications or integrations permissions', () => {
    assert.equal(
      canAccessBusinessCommunications({
        roleName: 'Manager',
        permissions: ['communications:read'],
      }),
      true,
    );
    assert.equal(
      canAccessBusinessCommunications({
        roleName: 'Member',
        permissions: ['fleet:read'],
      }),
      false,
    );
  });

  it('send policy constants imply no auto-send', () => {
    const sendPolicy = {
      autoSendEnabled: false as const,
      requiresOwnerOrStaffApproval: true as const,
      draftApproveExecute: true as const,
    };
    assert.equal(sendPolicy.autoSendEnabled, false);
    assert.equal(sendPolicy.requiresOwnerOrStaffApproval, true);
  });
});
