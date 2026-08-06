import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canAccessPersonalWhatsappAssistant,
  canConnectBusinessGmail,
  canSyncBusinessGmail,
  personalAllowedInBusinessSearch,
} from '@titan/shared';
import { CommunicationsPlatformService } from './communications-platform.service.js';

describe('communications platform service RBAC guards', () => {
  const service = new CommunicationsPlatformService({} as never, undefined);

  it('canConnectBusinessGmail allows Platform Owner and Company Owner; blocks staff/client', () => {
    assert.equal(
      canConnectBusinessGmail({
        roleName: 'Platform Owner',
        permissions: ['*'],
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
    for (const roleName of ['Admin', 'Office Staff', 'Technician', 'Client', 'Manager']) {
      assert.equal(
        canConnectBusinessGmail({
          roleName,
          permissions: ['*', 'communications:manage'],
        }),
        false,
      );
    }
  });

  it('canSyncBusinessGmail allows Owner/Admin sync and blocks Technician/Client', () => {
    assert.equal(
      canSyncBusinessGmail({ roleName: 'Admin', permissions: ['communications:write'] }),
      true,
    );
    assert.equal(
      canSyncBusinessGmail({
        roleName: 'Technician',
        permissions: ['communications:write'],
      }),
      false,
    );
    assert.equal(
      canSyncBusinessGmail({ roleName: 'Client', permissions: ['*'] }),
      false,
    );
  });

  it('assertPersonalAccess rejects Admin / Office / Tech / Developer / Support and staff roles', () => {
    for (const roleName of [
      'Admin',
      'Office',
      'Tech',
      'Technician',
      'Developer',
      'Support',
      'Manager',
      'Company Owner',
      'Dispatcher',
    ]) {
      assert.throws(
        () =>
          service.assertPersonalAccess({
            companyId: '00000000-0000-0000-0000-000000000001',
            userId: '00000000-0000-0000-0000-000000000002',
            roleName,
            permissions: ['*', 'communications:manage'],
          }),
        (err: Error & { code?: string }) =>
          err.name === 'CommunicationsPlatformError' && err.code === 'FORBIDDEN',
      );
      assert.equal(
        canAccessPersonalWhatsappAssistant({ roleName, permissions: ['*'] }),
        false,
      );
    }
  });

  it('assertPersonalAccess allows Platform Owner', () => {
    assert.doesNotThrow(() =>
      service.assertPersonalAccess({
        companyId: '00000000-0000-0000-0000-000000000001',
        userId: '00000000-0000-0000-0000-000000000002',
        roleName: 'Platform Owner',
        permissions: ['*', 'platform:cross_tenant'],
      }),
    );
  });

  it('personal never allowed in business search export surface', () => {
    assert.equal(personalAllowedInBusinessSearch('personal_whatsapp'), false);
  });

  it('aura personal_assist is forbidden for non-owner', () => {
    const hooks = service.listAuraHooks({
      companyId: 'c',
      userId: 'u',
      roleName: 'Manager',
      permissions: ['communications:read'],
    });
    const personal = hooks.find((h) => h.capability === 'personal_assist');
    assert.ok(personal);
    assert.equal(personal!.available, false);
    assert.equal(personal!.status, 'forbidden');
    assert.equal(personal!.exposesPersonalData, true);
  });

  it('hub send policy disables auto-send', () => {
    const hooks = service.listAuraHooks({
      companyId: 'c',
      userId: 'u',
      roleName: 'Platform Owner',
      permissions: ['*'],
    });
    assert.ok(hooks.every((h) => h.capability !== 'business_draft' || h.note.includes('approval')));
  });
});
