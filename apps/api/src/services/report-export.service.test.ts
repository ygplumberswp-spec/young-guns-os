import test from 'node:test';
import assert from 'node:assert/strict';
import { ReportExportError, ReportExportService } from './report-export.service.js';

function createService() {
  return new ReportExportService({} as never, {} as never, {} as never);
}

function ownerActor(companyId = 'tenant-a') {
  return {
    companyId,
    userId: 'owner-1',
    roleName: 'Company Owner',
    permissions: ['*'] as readonly string[],
  };
}

function officeActor() {
  return {
    companyId: 'tenant-a',
    userId: 'office-1',
    roleName: 'Office Staff',
    permissions: ['documents:read', 'jobs:read'] as readonly string[],
  };
}

function technicianActor(userId = 'tech-1') {
  return {
    companyId: 'tenant-a',
    userId,
    roleName: 'Technician',
    permissions: ['jobs:read'] as readonly string[],
  };
}

function clientActor() {
  return {
    companyId: 'tenant-a',
    userId: 'client-1',
    roleName: 'Client',
    permissions: ['documents:read', 'jobs:read'] as readonly string[],
  };
}

test('internal report export allows owner and office with documents permission', () => {
  const service = createService();
  assert.doesNotThrow(() =>
    service.assertAudienceAccess(ownerActor(), 'internal', null),
  );
  assert.doesNotThrow(() =>
    service.assertAudienceAccess(officeActor(), 'internal', null),
  );
});

test('internal report export denies unauthorized roles', () => {
  const service = createService();
  assert.throws(
    () =>
      service.assertAudienceAccess(
        {
          companyId: 'tenant-a',
          userId: 'guest-1',
          roleName: 'Guest',
          permissions: ['portal:read'] as readonly string[],
        },
        'internal',
        null,
      ),
    (error: unknown) =>
      error instanceof ReportExportError && error.code === 'FORBIDDEN',
  );
});

test('technician audience allows assigned technician and managers', () => {
  const service = createService();
  assert.doesNotThrow(() =>
    service.assertAudienceAccess(technicianActor('tech-assigned'), 'technician', 'tech-assigned'),
  );
  assert.doesNotThrow(() =>
    service.assertAudienceAccess(ownerActor(), 'technician', 'other-tech'),
  );
});

test('technician audience denies unassigned technician even with jobs:read', () => {
  const service = createService();
  assert.throws(
    () => service.assertAudienceAccess(technicianActor('tech-a'), 'technician', 'tech-b'),
    (error: unknown) =>
      error instanceof ReportExportError && error.code === 'FORBIDDEN',
  );
});

test('technician audience allows office staff with jobs:write', () => {
  const service = createService();
  assert.doesNotThrow(() =>
    service.assertAudienceAccess(
      {
        companyId: 'tenant-a',
        userId: 'office-1',
        roleName: 'Office Staff',
        permissions: ['jobs:write'] as readonly string[],
      },
      'technician',
      'tech-b',
    ),
  );
});

test('client audience requires documents or jobs read permission', () => {
  const service = createService();
  assert.doesNotThrow(() => service.assertAudienceAccess(clientActor(), 'client', null));
  assert.throws(
    () =>
      service.assertAudienceAccess(
        { ...clientActor(), permissions: ['portal:read'] },
        'client',
        null,
      ),
    (error: unknown) =>
      error instanceof ReportExportError && error.code === 'FORBIDDEN',
  );
});
