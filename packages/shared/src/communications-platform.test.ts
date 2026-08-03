import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canAccessBusinessCommunications,
  canAccessPersonalWhatsappAssistant,
  canConnectBusinessGmail,
  canSyncBusinessGmail,
  formatBusinessGmailUserStatus,
  formatCommPlatformCapabilityState,
  formatGmailSyncUserStatus,
  normalizeGmailSyncLifecycle,
  isBusinessAccountKind,
  isPersonalAccountKind,
  personalAllowedInBusinessSearch,
  technicianJobScopedOnly,
} from './communications-platform.js';

describe('communications platform RBAC & privacy', () => {
  it('Business Gmail Connect allows Platform Owner and Company Owner only', () => {
    assert.equal(
      canConnectBusinessGmail({
        roleName: 'Platform Owner',
        permissions: ['*', 'platform:cross_tenant'],
      }),
      true,
    );
    assert.equal(
      canConnectBusinessGmail({
        roleName: 'Company Owner',
        permissions: ['*'],
      }),
      true,
    );
    assert.equal(
      canConnectBusinessGmail({
        roleName: 'Owner',
        permissions: ['*'],
      }),
      true,
    );
    for (const roleName of [
      'Admin',
      'Office',
      'Office Staff',
      'Technician',
      'Tech',
      'Client',
      'Manager',
      'Dispatcher',
      'Developer',
      'Support',
    ]) {
      assert.equal(
        canConnectBusinessGmail({
          roleName,
          permissions: ['*', 'communications:manage', 'integrations:manage'],
        }),
        false,
        `${roleName} must not Connect Business Gmail`,
      );
    }
  });

  it('Business Gmail user status is Disconnected when OAuth app ready but tenant not connected', () => {
    assert.equal(
      formatBusinessGmailUserStatus({ oauthConfigured: true, status: 'disconnected' }),
      'Disconnected',
    );
    assert.equal(
      formatBusinessGmailUserStatus({ oauthConfigured: true, status: 'not_configured' }),
      'Disconnected',
    );
    assert.equal(
      formatBusinessGmailUserStatus({ oauthConfigured: false, status: 'not_configured' }),
      'Not Configured',
    );
    assert.equal(
      formatBusinessGmailUserStatus({ oauthConfigured: false, status: 'disconnected' }),
      'Not Configured',
    );
    assert.equal(formatCommPlatformCapabilityState('connected'), 'Connected');
    assert.equal(formatCommPlatformCapabilityState('disconnected'), 'Disconnected');
    assert.equal(formatCommPlatformCapabilityState('not_configured'), 'Not Configured');
  });

  it('Business Gmail Sync allows Owners and Admin, never Technician or Client', () => {
    assert.equal(
      canSyncBusinessGmail({ roleName: 'Platform Owner', permissions: ['*'] }),
      true,
    );
    assert.equal(
      canSyncBusinessGmail({ roleName: 'Company Owner', permissions: ['*'] }),
      true,
    );
    assert.equal(
      canSyncBusinessGmail({
        roleName: 'Admin',
        permissions: ['communications:manage', 'communications:write'],
      }),
      true,
    );
    assert.equal(
      canSyncBusinessGmail({
        roleName: 'Manager',
        permissions: ['communications:write'],
      }),
      true,
    );
    assert.equal(
      canSyncBusinessGmail({
        roleName: 'Technician',
        permissions: ['communications:write', 'communications:read'],
      }),
      false,
    );
    assert.equal(
      canSyncBusinessGmail({
        roleName: 'Client',
        permissions: ['portal.communications:read', '*'],
      }),
      false,
    );
  });

  it('Gmail sync user status is honest Connected / Syncing / Completed / Failed', () => {
    assert.equal(
      formatGmailSyncUserStatus({ connected: true, lastSyncStatus: null }),
      'Connected',
    );
    assert.equal(
      formatGmailSyncUserStatus({ connected: true, lastSyncStatus: 'syncing' }),
      'Syncing',
    );
    assert.equal(
      formatGmailSyncUserStatus({ connected: true, lastSyncStatus: 'completed' }),
      'Completed',
    );
    assert.equal(
      formatGmailSyncUserStatus({ connected: true, lastSyncStatus: 'ok' }),
      'Completed',
    );
    assert.equal(
      formatGmailSyncUserStatus({ connected: true, lastSyncStatus: 'failed' }),
      'Failed',
    );
    assert.equal(
      formatGmailSyncUserStatus({ connected: false, lastSyncStatus: 'completed' }),
      'Disconnected',
    );
    assert.equal(normalizeGmailSyncLifecycle('ok'), 'completed');
    assert.equal(normalizeGmailSyncLifecycle(undefined), 'idle');
  });

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
